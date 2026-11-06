import {useCallback, useEffect, useRef, useState} from 'react';
import log from 'loglevel';
import chatService, {
    RESUME_ALREADY_COMPLETE,
    RESUME_REJECTED,
    RESUME_STREAMED,
    RESUME_UNAVAILABLE,
    TERMINAL_RUN_EVENTS,
} from '../service/ChatService.js';
import {AI, SYSTEM, USER} from '../chat/message/ChatMessage.jsx';
import {isPageHidden, observePageResumed} from '../util/pageLifecycle.js';

/*
 * Backs off rather than hammering: the backend may still be generating when the user returns.
 * Sums to roughly five minutes — past the image tool's 180 second deadline plus the answer the
 * model writes after it — after which a turn is assumed lost rather than left spinning.
 */
const RECOVERY_POLL_DELAYS_MILLISECONDS = [0, 1000, 2000, 4000, 8000, ...Array(28).fill(10000)];

/* Indexed by consecutive attempts that did not advance the cursor. */
const RESUME_RETRY_DELAYS_MILLISECONDS = [0, 1000, 2000, 4000, 8000, 15000, 15000, 15000, 15000, 15000];

/*
 * True once the server holds the outcome of this turn: an assistant reply with text or a
 * generated image, or the system message a cancelled turn writes. An answered elicitation is also
 * a system message, but it lands mid-turn, so it settles nothing. Anchored on the user message id
 * adopted from RUN_STARTED so a turn cannot be satisfied by an older reply already in the chat;
 * with no id — the frame never arrived — the last USER row is the best available anchor.
 */
export function hasSettledTurn(chatDetails, userMessageId) {
    const chatMessages = Array.isArray(chatDetails?.chatMessages) ? chatDetails.chatMessages : [];

    if (chatMessages.length === 0) {
        return false;
    }

    let userMessageIndex = userMessageId
        ? chatMessages.findIndex((chatMessage) => chatMessage.id === userMessageId)
        : -1;

    if (userMessageIndex < 0) {
        for (let messageIndex = chatMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
            if (chatMessages[messageIndex].messageType === USER) {
                userMessageIndex = messageIndex;
                break;
            }
        }
    }

    if (userMessageIndex < 0) {
        return false;
    }

    return chatMessages.slice(userMessageIndex + 1).some((chatMessage) => {
        if (chatMessage.messageType === SYSTEM) {
            return !chatMessage.elicitationId;
        }

        if (chatMessage.messageType !== AI || chatMessage.progressData) {
            return false;
        }

        const hasText = typeof chatMessage.message === 'string' && chatMessage.message.trim().length > 0;
        const hasGeneratedImages = Array.isArray(chatMessage.generatedImages) && chatMessage.generatedImages.length > 0;

        return hasText || hasGeneratedImages;
    });
}

/*
 * Owns what happens after a stream dies while the page was backgrounded. The turn is already
 * bound server-side, so recovery never re-sends anything — it waits for the user to come back
 * and reconciles the bubble against what the server persisted.
 */
function useStreamRecovery({reloadChatHistory, stopStreamingLastAIMessage}) {
    const [recovering, setRecovering] = useState(false);
    const [recoveryFailed, setRecoveryFailed] = useState(false);
    const activeRecoveryRef = useRef(null);
    const lastRecoveryRequestRef = useRef(null);

    const cancelActiveRecovery = useCallback(() => {
        const activeRecovery = activeRecoveryRef.current;

        if (!activeRecovery) {
            return;
        }

        activeRecovery.cancelled = true;
        activeRecovery.abortController.abort();
        activeRecovery.unsubscribe?.();

        if (activeRecovery.timeoutId) {
            clearTimeout(activeRecovery.timeoutId);
        }

        activeRecoveryRef.current = null;
        setRecovering(false);
    }, []);

    useEffect(() => {
        return () => {
            cancelActiveRecovery();
        };
    }, [cancelActiveRecovery]);

    const runRecovery = useCallback(async (recoveryToken, {recoveryChatId, userMessageId, lastEventId, onResumeChunk, quietWhenUnavailable = false}) => {
        const finishRecovery = (failed) => {
            if (activeRecoveryRef.current === recoveryToken) {
                activeRecoveryRef.current = null;
            }

            setRecovering(false);
            setRecoveryFailed(failed);
        };

        try {
            await waitForPageResumed(recoveryToken);

            if (recoveryToken.cancelled) {
                return;
            }

            /*
             * Replay is strictly better than reconciling: the frames we missed arrive in order,
             * so the answer and its progress log come back intact rather than being replaced
             * wholesale by the persisted text. Reconciliation stays as the fallback.
             */
            if (onResumeChunk) {
                const resumeOutcome = await resumeUntilTerminal(recoveryToken, recoveryChatId, lastEventId, onResumeChunk);

                if (recoveryToken.cancelled) {
                    return;
                }

                if (resumeOutcome === RESUME_STREAMED) {
                    /* The terminal frame already finalized the bubble; nothing further needed here. */
                    stopStreamingLastAIMessage();
                    finishRecovery(false);

                    return;
                }

                if (resumeOutcome === RESUME_ALREADY_COMPLETE) {
                    stopStreamingLastAIMessage();
                    await reloadChatHistory(recoveryChatId);

                    if (recoveryToken.cancelled) {
                        return;
                    }

                    finishRecovery(false);

                    return;
                }

                if (quietWhenUnavailable) {
                    stopStreamingLastAIMessage();
                    await reloadChatHistory(recoveryChatId);

                    if (recoveryToken.cancelled) {
                        return;
                    }

                    finishRecovery(false);

                    return;
                }

                if (resumeOutcome === RESUME_REJECTED) {
                    stopStreamingLastAIMessage();
                    finishRecovery(true);

                    return;
                }
            }

            for (const delayMilliseconds of RECOVERY_POLL_DELAYS_MILLISECONDS) {
                if (delayMilliseconds > 0) {
                    await waitForMilliseconds(recoveryToken, delayMilliseconds);
                }

                if (recoveryToken.cancelled) {
                    return;
                }

                let chatDetails = null;

                try {
                    chatDetails = await chatService.findChatDetails(recoveryChatId);
                } catch (caughtError) {
                    /* One failed poll is not a failed recovery — the network may still be settling. */
                    log.warn('[useStreamRecovery] Poll failed, retrying.', caughtError);
                }

                if (recoveryToken.cancelled) {
                    return;
                }

                if (hasSettledTurn(chatDetails, userMessageId)) {
                    /*
                     * Order matters. The merge in useChatHistory deliberately preserves a
                     * *streaming* local bubble and discards the server's copy of it, which is
                     * exactly backwards here — clear the flag first so the server's text wins.
                     */
                    stopStreamingLastAIMessage();
                    await reloadChatHistory(recoveryChatId);

                    if (recoveryToken.cancelled) {
                        return;
                    }

                    finishRecovery(false);

                    return;
                }
            }

            log.warn('[useStreamRecovery] Gave up waiting for the assistant reply.');
            stopStreamingLastAIMessage();
            finishRecovery(true);
        } catch (caughtError) {
            log.error('[useStreamRecovery] Recovery failed.', caughtError);
            stopStreamingLastAIMessage();
            finishRecovery(true);
        }
    }, [reloadChatHistory, stopStreamingLastAIMessage]);

    const beginRecovery = useCallback((recoveryRequest) => {
        if (!recoveryRequest?.recoveryChatId) {
            return false;
        }

        cancelActiveRecovery();

        lastRecoveryRequestRef.current = recoveryRequest;

        const recoveryToken = {cancelled: false, unsubscribe: null, timeoutId: null, abortController: new AbortController()};
        activeRecoveryRef.current = recoveryToken;

        setRecovering(true);
        setRecoveryFailed(false);

        /* Fire-and-forget by design — runRecovery handles its own failures and never rejects. */
        void runRecovery(recoveryToken, recoveryRequest);

        return true;
    }, [cancelActiveRecovery, runRecovery]);

    const retryRecovery = useCallback(() => {
        const lastRecoveryRequest = lastRecoveryRequestRef.current;

        if (!lastRecoveryRequest) {
            return false;
        }

        return beginRecovery(lastRecoveryRequest);
    }, [beginRecovery]);

    const dismissRecoveryFailure = useCallback(() => {
        setRecoveryFailed(false);
    }, []);

    return {
        recovering,
        recoveryFailed,
        beginRecovery,
        retryRecovery,
        dismissRecoveryFailure,
        cancelActiveRecovery,
    };
}

export default useStreamRecovery;

async function resumeUntilTerminal(recoveryToken, recoveryChatId, initialLastEventId, onResumeChunk) {
    let lastEventId = initialLastEventId;
    let fruitlessAttempts = 0;

    while (fruitlessAttempts < RESUME_RETRY_DELAYS_MILLISECONDS.length) {
        const retryDelayMilliseconds = RESUME_RETRY_DELAYS_MILLISECONDS[fruitlessAttempts];

        if (retryDelayMilliseconds > 0) {
            await waitForRetry(recoveryToken, retryDelayMilliseconds);
        }

        await waitForPageResumed(recoveryToken);
        await waitForOnline(recoveryToken);

        if (recoveryToken.cancelled) {
            return RESUME_UNAVAILABLE;
        }

        let sawTerminalFrame = false;
        const lastEventIdBeforeAttempt = lastEventId;
        let resumeOutcome;

        try {
            resumeOutcome = await chatService.chatStreamResume(recoveryChatId, lastEventId, {
                signal: recoveryToken.abortController.signal,
                onChunk: (rawEvent) => {
                    if (recoveryToken.cancelled) {
                        return;
                    }

                    if (rawEvent?.id) {
                        lastEventId = rawEvent.id;
                    }

                    if (TERMINAL_RUN_EVENTS.includes(rawEvent?.event)) {
                        sawTerminalFrame = true;
                    }

                    onResumeChunk(rawEvent);
                },
            });
        } catch (caughtError) {
            log.warn('[useStreamRecovery] Resume attempt failed; retrying.', caughtError);
        }

        if (resumeOutcome !== undefined && resumeOutcome !== RESUME_STREAMED) {
            return resumeOutcome;
        }

        if (sawTerminalFrame) {
            return RESUME_STREAMED;
        }

        fruitlessAttempts = lastEventId !== lastEventIdBeforeAttempt ? 0 : fruitlessAttempts + 1;
    }

    log.warn('[useStreamRecovery] Resume kept failing; reconciling from history instead.');

    return RESUME_UNAVAILABLE;
}

function waitForMilliseconds(recoveryToken, delayMilliseconds) {
    return new Promise((resolve) => {
        recoveryToken.timeoutId = setTimeout(() => {
            recoveryToken.timeoutId = null;
            resolve();
        }, delayMilliseconds);
    });
}

function waitForRetry(recoveryToken, delayMilliseconds) {
    return new Promise((resolve) => {
        let stopObservingPageResumed = () => {};

        const stopWaiting = () => {
            clearTimeout(recoveryToken.timeoutId);
            recoveryToken.timeoutId = null;
            recoveryToken.unsubscribe = null;
            stopObservingPageResumed();

            if (typeof window !== 'undefined') {
                window.removeEventListener('online', finishWaiting);
            }
        };

        const finishWaiting = () => {
            stopWaiting();
            resolve();
        };

        stopObservingPageResumed = observePageResumed(finishWaiting);

        if (typeof window !== 'undefined') {
            window.addEventListener('online', finishWaiting);
        }

        recoveryToken.timeoutId = setTimeout(finishWaiting, delayMilliseconds);
        recoveryToken.unsubscribe = stopWaiting;
    });
}

function waitForOnline(recoveryToken) {
    if (typeof navigator === 'undefined' || navigator.onLine !== false || typeof window === 'undefined') {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const stopWaiting = () => {
            window.removeEventListener('online', finishWaiting);
            recoveryToken.unsubscribe = null;
        };

        const finishWaiting = () => {
            stopWaiting();
            resolve();
        };

        window.addEventListener('online', finishWaiting);
        recoveryToken.unsubscribe = stopWaiting;
    });
}

function waitForPageResumed(recoveryToken) {
    if (!isPageHidden()) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        recoveryToken.unsubscribe = observePageResumed(() => {
            recoveryToken.unsubscribe?.();
            recoveryToken.unsubscribe = null;
            resolve();
        });
    });
}
