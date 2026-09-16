import {useCallback, useEffect, useRef, useState} from 'react';
import log from 'loglevel';
import {toast} from 'react-toastify';
import {useSharedData} from '../context/useSharedData.jsx';
import chatService, {DONE, ELICITATION, ERROR, INIT} from '../service/ChatService.js';
import streamService from '../service/StreamService.js';
import {AI, USER} from '../chat/message/ChatMessage.jsx';
import {generateMessageKey} from '../util/keys.js';
import {isPageHidden, observePageHidden} from '../util/pageLifecycle.js';
import useStreamRecovery from './useStreamRecovery.js';

/*
 * Frames that legitimately end this leg of the stream. `elicitation` belongs here because the
 * turn continues over the elicitation-response endpoint rather than this response body — and
 * useElicitation pops the AI placeholder when one arrives, so treating it as an unfinished
 * stream would both error falsely and target the wrong message.
 */
const TERMINAL_STREAM_EVENTS = [DONE, ERROR, ELICITATION];

/*
 * A cold vision model can take tens of seconds to load before it reports anything. One static
 * line for that whole window reads as a hang, and an abandoned turn is the one outcome that
 * guarantees the image never gets read.
 */
const VISION_WARMUP_NOTICE_DELAY_MILLISECONDS = 20000;
const VISION_WARMUP_NOTICE_TEXT = 'Still reading — the model may be warming up…';

function useChatStream({
    chatId,
    chatHistory,
    setChatHistory,
    appendToLastAIMessage,
    appendNotificationToLastAIMessage,
    updateSeededNotificationText,
    attachGeneratedImagesToLastAIMessage,
    stopStreamingLastAIMessage,
    appendSystemMessage,
    reloadChatHistory,
    finalizeLastAIMessage,
    ensureChatIdFromResponse,
    adoptMessageIdForLastUserMessage,
    updateAttachmentStatus,
    activeElicitation,
    setActiveElicitation,
    setElicitationSubmitting,
    setElicitationValues,
    getSelectedCommandRef,
    getMessageTextRef,
    attachmentTray,
}) {
    const {chatInputRef} = useSharedData();

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [inputValue, setInputValue] = useState('');
    const [attachmentNotice, setAttachmentNotice] = useState(null);
    const controller = useRef(null);

    /*
     * True only between `init` and the turn's end — narrower than `loading`, which also covers
     * the brief pre-`init` window. The Stop control keys off this rather than `loading` because
     * there is nothing to cancel server-side until `init` binds the turn to a chat id.
     */
    const [streamActive, setStreamActive] = useState(false);

    /*
     * The chat id `stopChat` targets. Mirrors the `resolvedChatId` closed over by `handleSubmit`
     * — a brand-new chat only learns its id from its own `init` frame, after the `chatId` prop
     * passed into this render has already gone stale.
     */
    const activeChatIdRef = useRef(null);

    /* Guards against a double-click sending two cancel requests; reset per turn, not per click. */
    const stoppingRef = useRef(false);

    /*
     * Whether `handleSubmit`'s try/finally is still open for the current turn. `stopChat` reads
     * this after its cancel request settles to decide whether restoring the Stop control still
     * makes sense — a turn that already ended (its own `finally` already ran) must not have it
     * resurrected just because a failed cancel POST happened to resolve after the fact.
     */
    const turnInFlightRef = useRef(false);

    /*
     * Whether the page went into the background at any point during the current turn. Checking
     * `isPageHidden()` at the moment the stream dies is not enough — the teardown surfaces
     * whenever the reader next runs, which is often after the user is already looking at the
     * screen again.
     */
    const pageWasHiddenDuringStreamRef = useRef(false);

    /*
     * The resume cursor. An opaque Redis stream entry id (`<milliseconds>-<sequence>`) — stored
     * and echoed verbatim, never parsed or compared. Keepalive comments carry no id, so they
     * never reach here and cannot advance it.
     */
    const lastEventIdRef = useRef(null);

    const {recovering, recoveryFailed, beginRecovery, retryRecovery, dismissRecoveryFailure, cancelActiveRecovery} = useStreamRecovery({
        reloadChatHistory,
        stopStreamingLastAIMessage,
    });

    /*
     * Drops this client's end of the turn. The backend runs an in-flight turn to completion
     * either way — what this stops is the frames still arriving here, which would otherwise be
     * appended to whatever bubble now sits at the end of a transcript they do not belong to.
     * On a transcript that was just cleared, that bubble is the welcome message.
     *
     * Aborting makes `chatStream` reject with an AbortError, which the handler already treats as
     * a clean end: it clears the streaming flag rather than reporting a failure. Any recovery
     * still waiting on this turn goes with it, since it would reconcile against a conversation
     * the user has left.
     */
    const abortActiveStream = useCallback(() => {
        controller.current?.abort();
        controller.current = null;
        cancelActiveRecovery();
    }, [cancelActiveRecovery]);

    const handleInputChange = (event) => {
        setInputValue(event.target.value);
    };

    const handleStreamChunk = useCallback((raw) => {
        chatService.handleStreamChunk(raw, {
            activeElicitation,
            chatId,
            appendToLastAIMessage,
            appendNotificationMessage: appendNotificationToLastAIMessage,
            ensureChatIdFromResponse,
            finalizeLastAIMessage,
            stopStreamingLastAIMessage,
            appendSystemMessage,
            /*
             * Read at call time, not captured — `stoppingRef` is a ref precisely so this always
             * sees the latest value regardless of when this callback's closure was created.
             */
            isCancelling: stoppingRef.current,
            setActiveElicitation,
            setElicitationSubmitting,
            setElicitationValues,
            setError,
            adoptMessageId: adoptMessageIdForLastUserMessage,
            attachGeneratedImages: attachGeneratedImagesToLastAIMessage,
            updateAttachmentStatus,
        });
    }, [
        activeElicitation,
        chatId,
        appendToLastAIMessage,
        appendNotificationToLastAIMessage,
        ensureChatIdFromResponse,
        adoptMessageIdForLastUserMessage,
        attachGeneratedImagesToLastAIMessage,
        updateAttachmentStatus,
        finalizeLastAIMessage,
        stopStreamingLastAIMessage,
        appendSystemMessage,
        setActiveElicitation,
        setElicitationSubmitting,
        setElicitationValues,
        setError,
    ]);

    /*
     * Held in a ref so the resumed stream routes through the current handler without the
     * recovery run capturing a stale one when its dependencies change mid-flight.
     */
    const handleStreamChunkRef = useRef(handleStreamChunk);

    useEffect(() => {
        handleStreamChunkRef.current = handleStreamChunk;
    }, [handleStreamChunk]);

    const handleResumedStreamChunk = useCallback((rawEvent) => {
        if (rawEvent?.id) {
            lastEventIdRef.current = rawEvent.id;
        }

        handleStreamChunkRef.current(rawEvent);
    }, []);

    const handleSubmit = async () => {
        if (loading) {
            return;
        }

        /* An id that is still uploading cannot be sent; block rather than send a partial set. */
        if (attachmentTray?.hasPendingUploads) {
            return;
        }

        const submittedInputValue = inputValue;
        const selectedCommand = getSelectedCommandRef?.current?.() || null;
        const submittedMessageText = getMessageTextRef?.current?.() || submittedInputValue.trim();

        if (!submittedMessageText) {
            return;
        }

        /* Never rejects; a failed caption keeps the original id rather than blocking the send. */
        const settledEntries = attachmentTray ? await attachmentTray.commitCaptions() : [];
        const attachmentIds = settledEntries.map((entry) => entry.attachmentId).filter((attachmentId) => !!attachmentId);

        /*
         * Built with the server's field names (`id`, `description`) plus the local URL, so
         * MessageAttachments sees one shape whether the bubble is optimistic or refetched.
         */
        const optimisticAttachments = settledEntries
            .filter((entry) => !!entry.attachmentId)
            .map((entry) => ({
                id: entry.attachmentId,
                fileName: entry.fileName,
                description: entry.uploadedCaption || '',
                contentType: entry.contentType,
                fileSizeBytes: entry.fileSizeBytes,
                localObjectUrl: entry.localObjectUrl,
            }));

        const updatedHistory = chatHistory.filter((message) => !message.ephemeral);
        const userMessage = {
            type: USER,
            text: submittedMessageText,
            attachments: optimisticAttachments,
            _key: generateMessageKey('user'),
        };
        /*
         * With attachments in flight the pre-token wait is dominated by the vision pass, and
         * the first real progress frame can be tens of seconds out on a cold vision model.
         * Seed one local step so that gap is not silent; the first real frame replaces it.
         */
        const seededNotifications = attachmentIds.length > 0
            ? [`Reading ${attachmentIds.length} ${attachmentIds.length === 1 ? 'file' : 'files'}…`]
            : [];

        const aiPlaceholder = {
            type: AI,
            text: '',
            _key: generateMessageKey('ai'),
            isStreaming: true,
            notifications: seededNotifications,
            hasSeededNotification: seededNotifications.length > 0,
        };

        setChatHistory([...updatedHistory, userMessage, aiPlaceholder]);
        setLoading(true);
        setInputValue('');

        if (chatInputRef.current) {
            chatInputRef.current.style.height = 'auto';
        }

        setError(null);
        setAttachmentNotice(null);

        /* A new turn supersedes any recovery still waiting on the previous one. */
        cancelActiveRecovery();
        dismissRecoveryFailure();

        let sawInit = false;
        let sawTerminalFrame = false;
        let visionWarmupTimeoutId = null;
        let resolvedChatId = chatId;
        let resolvedUserMessageId = null;

        lastEventIdRef.current = null;
        activeChatIdRef.current = chatId;
        stoppingRef.current = false;
        turnInFlightRef.current = true;

        /*
         * Recovery is only possible once the turn is bound server-side, which `init` is what
         * tells us — before it there is no chat id to reconcile against, and on an attachment
         * turn the ids may not be spent, so the restore path below owns that case instead.
         */
        const attemptStreamRecovery = () => {
            if (attachmentIds.length > 0 && !sawInit) {
                return false;
            }

            if (!pageWasHiddenDuringStreamRef.current && !isPageHidden()) {
                return false;
            }

            if (!resolvedChatId) {
                return false;
            }

            return beginRecovery({
                recoveryChatId: resolvedChatId,
                userMessageId: resolvedUserMessageId,
                lastEventId: lastEventIdRef.current,
                onResumeChunk: handleResumedStreamChunk,
            });
        };

        pageWasHiddenDuringStreamRef.current = isPageHidden();
        const unsubscribePageHidden = observePageHidden(() => {
            pageWasHiddenDuringStreamRef.current = true;
        });

        try {
            controller.current?.abort();
            controller.current = new AbortController();

            if (attachmentIds.length > 0) {
                visionWarmupTimeoutId = setTimeout(() => {
                    updateSeededNotificationText?.(VISION_WARMUP_NOTICE_TEXT);
                }, VISION_WARMUP_NOTICE_DELAY_MILLISECONDS);
            }

            const payload = {chatMessage: submittedMessageText};

            if (selectedCommand) {
                payload.commands = [selectedCommand];
            }

            if (attachmentIds.length > 0) {
                payload.attachmentIds = attachmentIds;
            }

            await chatService.chatStream(payload, chatId, {
                signal: controller.current.signal,
                onChunk: (rawEvent) => {
                    if (rawEvent?.id) {
                        lastEventIdRef.current = rawEvent.id;
                    }

                    if (rawEvent?.event === INIT) {
                        sawInit = true;

                        /*
                         * Read here as well as in the router: recovery needs these before the
                         * next render, and on a new chat the `chatId` prop is still stale.
                         */
                        const initIdentifiers = readInitFrameIdentifiers(rawEvent);
                        resolvedChatId = initIdentifiers.chatId ?? resolvedChatId;
                        resolvedUserMessageId = initIdentifiers.messageId ?? resolvedUserMessageId;
                        activeChatIdRef.current = resolvedChatId;
                        setStreamActive(true);
                    }

                    if (TERMINAL_STREAM_EVENTS.includes(rawEvent?.event)) {
                        sawTerminalFrame = true;
                    }

                    handleStreamChunk(rawEvent);
                },
            });

            /*
             * chatStream returns normally when the stream just ends, which is exactly the
             * silent-death case: the API emits `init` before any model or vision work on every
             * streaming path, so its absence means the connection died before anything was
             * bound — the staged ids are still good and the composer must come back intact.
             */
            if (attachmentIds.length > 0 && !sawInit) {
                setChatHistory(updatedHistory);
                setInputValue(submittedMessageText);
                attachmentTray?.restoreTray(settledEntries);
                setError(new Error(
                    selectedCommand
                        ? 'Your message could not be sent. Your text and attachments have been restored — please re-select the command and try again.'
                        : 'Your message could not be sent. Your text and attachments have been restored — please try again.'
                ));

                return;
            }

            attachmentTray?.clearTray();

            /*
             * `init` arrived but nothing closed the stream. The turn was bound and the ids are
             * spent, so the tray must NOT come back — a retry would resend them and §7.2's
             * all-or-nothing bind would reject the whole message. Only `done` clears the
             * streaming flag, so without this the placeholder spins forever with no error. A
             * long cold vision pass behind a proxy read timeout is how this happens in practice.
             */
            if (!sawTerminalFrame) {
                /*
                 * A backgrounded page is the common cause on mobile, and it is not an error —
                 * the turn is still running server-side. Recover instead of accusing the user's
                 * connection; the message below stays for every other cause.
                 */
                if (attemptStreamRecovery()) {
                    return;
                }

                stopStreamingLastAIMessage?.();
                setError(new Error('The response stopped before it finished. Your message was sent — ask again to see the rest.'));

                return;
            }

            const entriesWithLostCaptions = settledEntries.filter((entry) => entry.captionCommitFailed);

            if (entriesWithLostCaptions.length > 0) {
                const affectedFileNames = entriesWithLostCaptions.map((entry) => entry.fileName).join(', ');
                setAttachmentNotice(`Your note on ${affectedFileNames} could not be saved. The file was still sent.`);
            }
        } catch (caughtError) {
            if (caughtError.name === 'AbortError') {
                log.info('[ChatScreen] Stream aborted.');
                setChatHistory((previousHistory) => {
                    const newHistory = [...previousHistory];
                    const lastIndex = newHistory.length - 1;

                    if (lastIndex >= 0 && newHistory[lastIndex].type === AI) {
                        newHistory[lastIndex] = { ...newHistory[lastIndex], isStreaming: false };
                    }

                    return newHistory;
                });
                return;
            }

            /*
             * The transport died. If the page was backgrounded, that is a mobile browser
             * reaping an idle connection rather than a failure worth showing — the turn is
             * bound and still running, so the ids are spent and the tray must not come back.
             */
            if (streamService.isTransientStreamDisconnect(caughtError) && attemptStreamRecovery()) {
                log.info('[ChatScreen] Stream interrupted while backgrounded; recovering.');
                attachmentTray?.clearTray();

                return;
            }

            streamService.handleStreamError(caughtError, setError, setChatHistory);
        } finally {
            unsubscribePageHidden();

            if (visionWarmupTimeoutId) {
                clearTimeout(visionWarmupTimeoutId);
            }

            setLoading(false);
            setStreamActive(false);
            turnInFlightRef.current = false;
        }
    };

    /*
     * Sends the cancel signal for the turn in progress. Fire-and-forget on the server side — the
     * outcome still arrives as a normal `chunk`/`done` pair on the stream already open, so this
     * only hides the control and reports a failure to send the signal at all. Guarded by a ref
     * rather than the `streamActive` state so two calls in the same tick (a double-click) cannot
     * both pass the check before the first has re-rendered.
     */
    const stopChat = useCallback(async () => {
        if (!streamActive || stoppingRef.current) {
            return;
        }

        stoppingRef.current = true;
        setStreamActive(false);

        try {
            await chatService.cancelStream(activeChatIdRef.current);
        } catch (caughtError) {
            console.error('[useChatStream] Failed to cancel the streaming chat:', caughtError);
            toast.error('Could not stop the response. Please try again.');

            /*
             * The signal never reached the server, so the turn is still genuinely running —
             * restore the Stop control and normal chunk handling so the user can try again.
             * Skipped if the turn already ended while this request was in flight, which would
             * otherwise resurrect Stop for a conversation that has already moved on.
             */
            if (turnInFlightRef.current) {
                stoppingRef.current = false;
                setStreamActive(true);
            }
        }
    }, [streamActive]);

    return {
        loading,
        error,
        setError,
        inputValue,
        setInputValue,
        handleInputChange,
        handleSubmit,
        handleStreamChunk,
        abortActiveStream,
        attachmentNotice,
        setAttachmentNotice,
        recovering,
        recoveryFailed,
        retryRecovery,
        dismissRecoveryFailure,
        streamActive,
        stopChat,
    };
}

export default useChatStream;

/*
 * The router parses this frame too, but it feeds React state that is not readable until the
 * next render — recovery needs the identifiers synchronously, while the stream is unwinding.
 * `id` and `chatId` are both accepted for the same reason `ensureChatIdFromResponse` accepts
 * both: the frame has been observed carrying either.
 */
function readInitFrameIdentifiers(rawEvent) {
    try {
        const initData = JSON.parse(rawEvent?.data);

        return {
            chatId: initData?.chatId ?? initData?.id ?? null,
            messageId: initData?.messageId ?? null,
        };
    } catch {
        return {chatId: null, messageId: null};
    }
}
