import {useCallback, useEffect, useRef, useState} from 'react';
import log from 'loglevel';
import {toast} from 'react-toastify';
import {useSharedData} from '../context/useSharedData.jsx';
import chatService, {
    RUN_STARTED,
    TERMINAL_RUN_EVENTS,
    TOOL_CALL_ARGS,
    findRunStartedUserMessageId,
} from '../service/ChatService.js';
import streamService from '../service/StreamService.js';
import {isDismissibleElicitation} from '../service/ElicitationService.js';
import {MODEL_LIST_UNAVAILABLE_CODE, UNKNOWN_MODEL_CODE} from '../service/ChatModelService.js';
import {LLM_KEY_MISSING_CODE, NO_MODEL_ACCESS_MESSAGE} from '../service/LlmKeyService.js';
import {ApiError} from '../client/ApiClient.js';
import {AI, USER} from '../chat/message/ChatMessage.jsx';
import {generateMessageKey} from '../util/keys.js';
import {isPageHidden, observePageHidden, observePageResumed} from '../util/pageLifecycle.js';
import activeTurnRegistry from '../util/activeTurnRegistry.js';
import useStreamRecovery, {hasSettledTurn} from './useStreamRecovery.js';

/*
 * A cold vision model can take tens of seconds to load before it reports anything. One static
 * line for that whole window reads as a hang, and an abandoned turn is the one outcome that
 * guarantees the image never gets read.
 */
const VISION_WARMUP_NOTICE_DELAY_MILLISECONDS = 20000;
const VISION_WARMUP_NOTICE_TEXT = 'Still reading — the model may be warming up…';

/* The server only sends a push notification when no stream is open, so a hidden page lets go of its stream. */
const BACKGROUND_STREAM_RELEASE_DELAY_MILLISECONDS = 5000;

/* A declined prompt ends its run promptly; one that has not ended by now is not going to. */
const DECLINED_RUN_SETTLE_TIMEOUT_MILLISECONDS = 10000;

function isRejectedBeforeRunStarted(caughtError) {
    return caughtError instanceof ApiError
        && (caughtError.status < 500 || caughtError.code === MODEL_LIST_UNAVAILABLE_CODE);
}

function describeRejectedSend(caughtError, selectedCommand) {
    if (caughtError.code === LLM_KEY_MISSING_CODE) {
        return NO_MODEL_ACCESS_MESSAGE;
    }

    if (caughtError.code === UNKNOWN_MODEL_CODE) {
        return 'The model you picked is no longer available. Pick another and send again.';
    }

    if (caughtError.code === MODEL_LIST_UNAVAILABLE_CODE) {
        return 'The model list could not be checked, so your message was not sent. Please try again.';
    }

    return selectedCommand
        ? 'Your message could not be sent. Your text has been restored — please re-select the command and try again.'
        : 'Your message could not be sent. Your text has been restored — please try again.';
}

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
    appendErrorMessage,
    reloadChatHistory,
    finalizeLastAIMessage,
    ensureChatIdFromResponse,
    adoptMessageIdForLastUserMessage,
    updateAttachmentStatus,
    mergeMetadataIntoLastAIMessage,
    playSound,
    activeElicitation,
    setActiveElicitation,
    setElicitationSubmitting,
    setElicitationValues,
    getSelectedCommandRef,
    getMessageTextRef,
    attachmentTray,
    pendingModel,
    rejectPendingModel,
    clearModelNotice,
}) {
    const {chatInputRef} = useSharedData();

    const [loading, setLoading] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [attachmentNotice, setAttachmentNotice] = useState(null);
    const controller = useRef(null);

    /*
     * True only between RUN_STARTED and the turn's end — narrower than `loading`, which also
     * covers the brief window before it. The Stop control keys off this rather than `loading`
     * because there is nothing to cancel server-side until RUN_STARTED binds the turn to a chat id.
     */
    const [streamActive, setStreamActive] = useState(false);
    const [attachedTurnActive, setAttachedTurnActive] = useState(false);
    const recoveringRef = useRef(false);
    const attachedTurnRef = useRef(false);

    /*
     * The chat id `stopChat` targets. Mirrors the `resolvedChatId` closed over by `handleSubmit`
     * — a brand-new chat only learns its id from its own RUN_STARTED frame, after the `chatId` prop
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
     * The resume cursor. An opaque Redis stream entry id (`<milliseconds>-<sequence>`) — stored
     * and echoed verbatim, never parsed or compared. Keepalive comments carry no id, so they
     * never reach here and cannot advance it.
     */
    const lastEventIdRef = useRef(null);

    const {recovering, recoveryFailed, beginRecovery, retryRecovery, dismissRecoveryFailure, cancelActiveRecovery} = useStreamRecovery({
        reloadChatHistory,
        stopStreamingLastAIMessage,
    });

    useEffect(() => {
        if (!recovering) {
            setAttachedTurnActive(false);
            attachedTurnRef.current = false;
        }

        recoveringRef.current = recovering;
    }, [recovering]);

    /*
     * A turn sent after awaiting another one must build on the transcript as it is now, not as
     * it was when the user pressed Enter.
     */
    const chatHistoryRef = useRef(chatHistory);

    useEffect(() => {
        chatHistoryRef.current = chatHistory;
    }, [chatHistory]);

    const turnInProgress = loading || recovering;
    const turnInProgressRef = useRef(turnInProgress);
    const turnIdleWaitersRef = useRef([]);

    useEffect(() => {
        turnInProgressRef.current = turnInProgress;

        if (turnInProgress) {
            return;
        }

        const turnIdleWaiters = turnIdleWaitersRef.current;
        turnIdleWaitersRef.current = [];
        turnIdleWaiters.forEach((resolveWaiter) => resolveWaiter());
    }, [turnInProgress]);

    /* Resolves true once no turn is running, or false if one is still running after the timeout. */
    const waitForTurnIdle = (timeoutMilliseconds) => new Promise((resolve) => {
        if (!turnInProgressRef.current) {
            resolve(true);
            return;
        }

        let timeoutId = null;

        const resolveWaiter = () => {
            clearTimeout(timeoutId);
            resolve(true);
        };

        timeoutId = setTimeout(() => {
            turnIdleWaitersRef.current = turnIdleWaitersRef.current.filter((waiter) => waiter !== resolveWaiter);
            resolve(false);
        }, timeoutMilliseconds);

        turnIdleWaitersRef.current.push(resolveWaiter);
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
            appendErrorMessage,
            adoptMessageId: adoptMessageIdForLastUserMessage,
            attachGeneratedImages: attachGeneratedImagesToLastAIMessage,
            updateAttachmentStatus,
            mergeMessageMetadata: mergeMetadataIntoLastAIMessage,
            playSound,
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
        mergeMetadataIntoLastAIMessage,
        playSound,
        finalizeLastAIMessage,
        stopStreamingLastAIMessage,
        appendSystemMessage,
        setActiveElicitation,
        setElicitationSubmitting,
        setElicitationValues,
        appendErrorMessage,
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

        if (TERMINAL_RUN_EVENTS.includes(rawEvent?.event)) {
            activeTurnRegistry.forget(activeChatIdRef.current);
        }

        handleStreamChunkRef.current(rawEvent);
    }, []);

    /*
     * Picks up a turn the server is still running when its chat is opened — after a reload, a
     * push, or coming back from another chat. Nothing on screen holds the turn's earlier frames,
     * so it is always replayed from its own RUN_STARTED: from the cursor this tab saved when it
     * started the turn, or else from the start of the buffer, skipping the earlier turns in it.
     */
    const attachIfInFlight = useCallback((attachChatId, chatDetails) => {
        if (!attachChatId || turnInFlightRef.current || recoveringRef.current) {
            return;
        }

        const chatMessages = Array.isArray(chatDetails?.chatMessages) ? chatDetails.chatMessages : [];
        const lastUserMessage = [...chatMessages].reverse().find((chatMessage) => chatMessage.messageType === USER);

        if (!lastUserMessage || hasSettledTurn(chatDetails, lastUserMessage.id)) {
            activeTurnRegistry.forget(attachChatId);
            return;
        }

        const registryEntry = activeTurnRegistry.read(attachChatId);
        const runStartedEventId = registryEntry?.userMessageId === lastUserMessage.id ? registryEntry.runStartedEventId : null;
        const answeredElicitationIds = new Set(
            chatMessages.filter((chatMessage) => chatMessage.elicitationId).map((chatMessage) => chatMessage.elicitationId),
        );

        let reachedThisTurn = !!runStartedEventId;

        const replayThisTurnOnly = (rawEvent) => {
            if (!reachedThisTurn) {
                if (rawEvent?.event !== RUN_STARTED || readRunStartedIdentifiers(rawEvent).userMessageId !== lastUserMessage.id) {
                    return;
                }

                reachedThisTurn = true;
            }

            if (rawEvent?.event === TOOL_CALL_ARGS && answeredElicitationIds.has(readToolCallId(rawEvent))) {
                return;
            }

            handleResumedStreamChunk(rawEvent);
        };

        setChatHistory((previousHistory) => [
            ...previousHistory,
            {type: AI, text: '', _key: generateMessageKey('ai'), isStreaming: true, notifications: []},
        ]);

        activeChatIdRef.current = attachChatId;
        lastEventIdRef.current = runStartedEventId;
        stoppingRef.current = false;
        setAttachedTurnActive(true);
        attachedTurnRef.current = true;
        recoveringRef.current = true;

        beginRecovery({
            recoveryChatId: attachChatId,
            userMessageId: lastUserMessage.id,
            lastEventId: runStartedEventId,
            onResumeChunk: replayThisTurnOnly,
            quietWhenUnavailable: true,
        });
    }, [beginRecovery, handleResumedStreamChunk, setChatHistory]);

    /*
     * Resolves false when nothing went out, so the composer keeps a selected command for the retry.
     * The composer passes its own tray and model at click time: this hook lives above the router,
     * so the options it was rendered with may predate the user's latest pick.
     */
    const handleSubmit = async (composer = {}) => {
        const turnComposer = {
            attachmentTray: composer.attachmentTray ?? attachmentTray,
            pendingModel: composer.pendingModel ?? pendingModel,
            rejectPendingModel: composer.rejectPendingModel ?? rejectPendingModel,
            clearModelNotice: composer.clearModelNotice ?? clearModelNotice,
        };

        if (turnInProgress && composer.dismissElicitation && isDismissibleElicitation(activeElicitation)) {
            return await sendInsteadOfOpenPrompt(composer.dismissElicitation, turnComposer);
        }

        if (loading) {
            return false;
        }

        /* An id that is still uploading cannot be sent; block rather than send a partial set. */
        if (turnComposer.attachmentTray?.hasPendingUploads) {
            return false;
        }

        const submittedInputValue = inputValue;
        const selectedCommand = getSelectedCommandRef?.current?.() || null;
        const submittedMessageText = getMessageTextRef?.current?.() || submittedInputValue.trim();

        if (!submittedMessageText && !selectedCommand) {
            return false;
        }

        await sendTurn(selectedCommand, submittedMessageText, turnComposer);

        return true;
    };

    /*
     * The open run is parked on the prompt, so the typed text cannot go into it. The prompt is
     * declined, the API ends the run, and the text is sent as an ordinary turn. A typed answer
     * never carries files.
     */
    const sendInsteadOfOpenPrompt = async (dismissElicitation, turnComposer) => {
        const selectedCommand = getSelectedCommandRef?.current?.() || null;
        const submittedMessageText = getMessageTextRef?.current?.() || inputValue.trim();

        if (!submittedMessageText) {
            return false;
        }

        const dismissed = await dismissElicitation();

        if (!dismissed) {
            return false;
        }

        const runSettled = await waitForTurnIdle(DECLINED_RUN_SETTLE_TIMEOUT_MILLISECONDS);

        if (!runSettled) {
            log.warn('[useChatStream] The run did not end after its prompt was declined; the typed text was not sent.');
            appendErrorMessage(describeRejectedSend({}, selectedCommand));

            return false;
        }

        await sendTurn(selectedCommand, submittedMessageText, {...turnComposer, attachmentTray: null});

        return true;
    };

    const sendTurn = async (selectedCommand, submittedMessageText, turnComposer) => {
        turnInFlightRef.current = true;
        attachedTurnRef.current = false;

        const {
            attachmentTray: turnAttachmentTray,
            pendingModel: turnPendingModel,
            rejectPendingModel: rejectTurnPendingModel,
            clearModelNotice: clearTurnModelNotice,
        } = turnComposer;

        /* Never rejects; a failed caption keeps the original id rather than blocking the send. */
        const settledEntries = turnAttachmentTray ? await turnAttachmentTray.commitCaptions() : [];
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

        const updatedHistory = chatHistoryRef.current.filter((message) => !message.ephemeral);
        const userMessage = {
            type: USER,
            text: submittedMessageText,
            attachments: optimisticAttachments,
            commands: selectedCommand ? [selectedCommand] : [],
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

        setAttachmentNotice(null);
        clearTurnModelNotice?.();

        /* A new turn supersedes any recovery still waiting on the previous one. */
        cancelActiveRecovery();
        dismissRecoveryFailure();

        let sawRunStarted = false;
        let sawTerminalFrame = false;
        let visionWarmupTimeoutId = null;
        let releaseTimeoutId = null;
        let releasedForBackground = false;
        let turnController = null;
        let resolvedChatId = chatId;
        let resolvedUserMessageId = null;
        let trayCleared = false;

        const clearTrayOnce = () => {
            if (trayCleared) {
                return;
            }

            trayCleared = true;
            turnAttachmentTray?.clearTray();
        };

        lastEventIdRef.current = null;
        activeChatIdRef.current = chatId;
        stoppingRef.current = false;
        turnInFlightRef.current = true;

        /*
         * Recovery is only possible once the turn is bound server-side, which RUN_STARTED is what
         * tells us — before it the message may never have reached the server, and a resume with
         * no cursor would replay every earlier turn still in the chat's buffer.
         */
        const attemptStreamRecovery = () => {
            if (!sawRunStarted) {
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

        const shouldReleaseForBackground = () => isPageHidden() && sawRunStarted && !sawTerminalFrame;

        const clearReleaseTimer = () => {
            if (releaseTimeoutId) {
                clearTimeout(releaseTimeoutId);
                releaseTimeoutId = null;
            }
        };

        const armReleaseTimer = () => {
            if (releaseTimeoutId || !shouldReleaseForBackground()) {
                return;
            }

            releaseTimeoutId = setTimeout(() => {
                releaseTimeoutId = null;

                if (!shouldReleaseForBackground()) {
                    return;
                }

                releasedForBackground = true;
                turnController?.abort();
            }, BACKGROUND_STREAM_RELEASE_DELAY_MILLISECONDS);
        };

        const unsubscribePageHidden = observePageHidden(() => {
            armReleaseTimer();
        });
        const unsubscribePageResumed = observePageResumed(clearReleaseTimer);

        const restoreComposer = (errorMessage) => {
            setChatHistory(updatedHistory);
            setInputValue(submittedMessageText);

            if (settledEntries.length > 0) {
                turnAttachmentTray?.restoreTray(settledEntries);
            }

            appendErrorMessage(errorMessage);
        };

        try {
            controller.current?.abort();
            controller.current = new AbortController();
            turnController = controller.current;

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

            if (!chatId && turnPendingModel) {
                payload.model = turnPendingModel;
            }

            await chatService.chatStream(payload, chatId, {
                signal: controller.current.signal,
                onChunk: (rawEvent) => {
                    if (rawEvent?.id) {
                        lastEventIdRef.current = rawEvent.id;
                    }

                    if (rawEvent?.event === RUN_STARTED) {
                        sawRunStarted = true;

                        /*
                         * Read here as well as in the router: recovery needs these before the
                         * next render, and on a new chat the `chatId` prop is still stale.
                         */
                        const runStartedIdentifiers = readRunStartedIdentifiers(rawEvent);
                        resolvedChatId = runStartedIdentifiers.chatId ?? resolvedChatId;
                        resolvedUserMessageId = runStartedIdentifiers.userMessageId ?? resolvedUserMessageId;
                        activeChatIdRef.current = resolvedChatId;
                        setStreamActive(true);
                        armReleaseTimer();
                        activeTurnRegistry.remember(resolvedChatId, {
                            runStartedEventId: rawEvent.id,
                            userMessageId: resolvedUserMessageId,
                        });
                        clearTrayOnce();
                    }

                    /*
                     * An open elicitation is not an end: its answer's POST has no body, so the
                     * rest of the turn can only arrive here. A drop while a question is open is a
                     * truncated turn like any other.
                     */
                    if (TERMINAL_RUN_EVENTS.includes(rawEvent?.event)) {
                        sawTerminalFrame = true;
                        clearReleaseTimer();
                        activeTurnRegistry.forget(resolvedChatId);
                    }

                    handleStreamChunkRef.current(rawEvent);
                },
            });

            /*
             * chatStream returns normally when the stream just ends, which is exactly the
             * silent-death case: the API emits RUN_STARTED before any model or vision work on every
             * streaming path, so its absence means the connection died before anything was
             * bound — the staged ids are still good and the composer must come back intact.
             */
            if (attachmentIds.length > 0 && !sawRunStarted) {
                restoreComposer(
                    selectedCommand
                        ? 'Your message could not be sent. Your text and attachments have been restored — please re-select the command and try again.'
                        : 'Your message could not be sent. Your text and attachments have been restored — please try again.'
                );

                return;
            }

            clearTrayOnce();

            /*
             * RUN_STARTED arrived but nothing closed the stream. The turn was bound and the ids are
             * spent, so the tray must NOT come back — a retry would resend them and §7.2's
             * all-or-nothing bind would reject the whole message. Only RUN_FINISHED clears the
             * streaming flag, so without this the placeholder spins forever with no error. A
             * long cold vision pass behind a proxy read timeout is how this happens in practice.
             */
            if (!sawTerminalFrame) {
                /* The turn is still running server-side, so this is a dropped reader, not a failed turn. */
                if (attemptStreamRecovery()) {
                    return;
                }

                stopStreamingLastAIMessage?.();
                appendErrorMessage('The response stopped before it finished. Your message was sent — ask again to see the rest.');

                return;
            }

            const entriesWithLostCaptions = settledEntries.filter((entry) => entry.captionCommitFailed);

            if (entriesWithLostCaptions.length > 0) {
                const affectedFileNames = entriesWithLostCaptions.map((entry) => entry.fileName).join(', ');
                setAttachmentNotice(`Your note on ${affectedFileNames} could not be saved. The file was still sent.`);
            }
        } catch (caughtError) {
            if (caughtError.name === 'AbortError') {
                if (releasedForBackground) {
                    clearTrayOnce();

                    if (attemptStreamRecovery()) {
                        log.info('[useChatStream] Stream released while backgrounded; recovering.');
                        return;
                    }

                    stopStreamingLastAIMessage?.();
                    appendErrorMessage('The response stopped before it finished. Your message was sent — ask again to see the rest.');

                    return;
                }

                log.info('[useChatStream] Stream aborted.');
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
             * Rejected before the SSE response started (the model check runs first), so no chat or
             * message was created and the attachment ids are unspent — the composer comes back whole.
             */
            if (!sawRunStarted && isRejectedBeforeRunStarted(caughtError)) {
                restoreComposer(describeRejectedSend(caughtError, selectedCommand));

                if (caughtError.code === UNKNOWN_MODEL_CODE) {
                    rejectTurnPendingModel?.();
                }

                return;
            }

            /*
             * The transport died or went silent past the idle watchdog. The turn is bound and
             * still running, so the ids are spent and the tray must not come back.
             */
            if (streamService.isTransientStreamDisconnect(caughtError) && attemptStreamRecovery()) {
                log.info('[useChatStream] Stream interrupted; recovering.');
                clearTrayOnce();

                return;
            }

            streamService.handleStreamError(caughtError, appendErrorMessage, setChatHistory);
        } finally {
            unsubscribePageHidden();
            unsubscribePageResumed();
            clearReleaseTimer();

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
     * outcome still arrives as a `cancel` CUSTOM event and RUN_FINISHED on the stream already open, so this
     * only hides the control and reports a failure to send the signal at all. Guarded by a ref
     * rather than the `streamActive` state so two calls in the same tick (a double-click) cannot
     * both pass the check before the first has re-rendered.
     */
    const stopChat = useCallback(async () => {
        if ((!streamActive && !attachedTurnActive) || stoppingRef.current) {
            return;
        }

        stoppingRef.current = true;
        setStreamActive(false);
        setAttachedTurnActive(false);

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
            } else if (attachedTurnRef.current) {
                stoppingRef.current = false;
                setAttachedTurnActive(true);
            }
        }
    }, [streamActive, attachedTurnActive]);

    return {
        loading,
        turnInProgress,
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
        streamActive: streamActive || attachedTurnActive,
        stopChat,
        attachIfInFlight,
    };
}

export default useChatStream;

/*
 * The router parses this frame too, but it feeds React state that is not readable until the
 * next render — recovery needs the identifiers synchronously, while the stream is unwinding.
 */
function readRunStartedIdentifiers(rawEvent) {
    try {
        const runStartedData = JSON.parse(rawEvent?.data);

        return {
            chatId: runStartedData?.threadId ?? null,
            userMessageId: findRunStartedUserMessageId(runStartedData),
        };
    } catch {
        return {chatId: null, userMessageId: null};
    }
}

function readToolCallId(rawEvent) {
    try {
        return JSON.parse(rawEvent?.data)?.toolCallId ?? null;
    } catch {
        return null;
    }
}
