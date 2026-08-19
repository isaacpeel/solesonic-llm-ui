import {useCallback, useEffect, useRef, useState} from 'react';
import log from 'loglevel';
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
const VISION_WARMUP_NOTICE_TEXT = 'Still reading — the vision model may be warming up…';

function useChatStream({
    chatId,
    chatHistory,
    setChatHistory,
    appendToLastAIMessage,
    appendNotificationToLastAIMessage,
    updateSeededNotificationText,
    attachGeneratedImagesToLastAIMessage,
    stopStreamingLastAIMessage,
    markLastAIMessageReconnecting,
    clearReconnectingMark,
    reloadChatHistory,
    finalizeLastAIMessage,
    ensureChatIdFromResponse,
    adoptMessageIdForLastUserMessage,
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
        markLastAIMessageReconnecting,
        clearReconnectingMark,
    });

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
            setActiveElicitation,
            setElicitationSubmitting,
            setElicitationValues,
            setError,
            adoptMessageId: adoptMessageIdForLastUserMessage,
            attachGeneratedImages: attachGeneratedImagesToLastAIMessage,
        });
    }, [
        activeElicitation,
        chatId,
        appendToLastAIMessage,
        appendNotificationToLastAIMessage,
        ensureChatIdFromResponse,
        adoptMessageIdForLastUserMessage,
        attachGeneratedImagesToLastAIMessage,
        finalizeLastAIMessage,
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
            ? [`Reading ${attachmentIds.length} ${attachmentIds.length === 1 ? 'image' : 'images'}…`]
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
                        ? 'Your message could not be sent. Your text and images have been restored — please re-select the command and try again.'
                        : 'Your message could not be sent. Your text and images have been restored — please try again.'
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
                setAttachmentNotice(`Your note on ${affectedFileNames} could not be saved. The image was still sent.`);
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
            setTimeout(() => {
                chatInputRef.current?.focus();
            }, 300);
        }
    };

    return {
        loading,
        error,
        setError,
        inputValue,
        setInputValue,
        handleInputChange,
        handleSubmit,
        handleStreamChunk,
        attachmentNotice,
        setAttachmentNotice,
        recovering,
        recoveryFailed,
        retryRecovery,
        dismissRecoveryFailure,
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
