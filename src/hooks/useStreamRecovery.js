import {useCallback, useEffect, useRef, useState} from 'react';
import log from 'loglevel';
import chatService, {
    DONE,
    ERROR,
    RESUME_ALREADY_COMPLETE,
    RESUME_REJECTED,
    RESUME_STREAMED,
    RESUME_UNAVAILABLE,
} from '../service/ChatService.js';
import {AI, USER} from '../chat/message/ChatMessage.jsx';
import {isPageHidden, observePageResumed} from '../util/pageLifecycle.js';

/*
 * Backs off rather than hammering: the backend may still be generating when the user returns,
 * and a cold model can take tens of seconds. Sums to roughly 95 seconds, after which a turn is
 * assumed lost rather than left spinning.
 */
const RECOVERY_POLL_DELAYS_MILLISECONDS = [0, 1000, 2000, 4000, 8000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000];

/*
 * A recovery that resolves near-instantly (the tab was only backgrounded for a moment) would
 * otherwise flash "Reconnecting…" and clear it before anyone reads it. Floors how long the mark
 * stays up without floor-ing the recovery itself — reloadChatHistory/stopStreamingLastAIMessage
 * still run immediately; only the reconnecting mark's clear is deferred to top up the remainder.
 */
const MINIMUM_RECONNECTING_VISIBLE_MILLISECONDS = 3000;

/*
 * True once the server holds an assistant reply for this turn. Anchored on the user message id
 * adopted from `init` so a turn cannot be satisfied by an older reply already in the chat; with
 * no id — the frame never arrived — the last USER row is the best available anchor.
 */
export function hasCompletedAssistantReply(chatDetails, userMessageId) {
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
        return chatMessage.messageType === AI
            && !chatMessage.progressData
            && typeof chatMessage.message === 'string'
            && chatMessage.message.trim().length > 0;
    });
}

/*
 * Owns what happens after a stream dies while the page was backgrounded. The turn is already
 * bound server-side, so recovery never re-sends anything — it waits for the user to come back
 * and reconciles the bubble against what the server persisted.
 */
function useStreamRecovery({reloadChatHistory, stopStreamingLastAIMessage, markLastAIMessageReconnecting, clearReconnectingMark}) {
    const [recovering, setRecovering] = useState(false);
    const [recoveryFailed, setRecoveryFailed] = useState(false);
    const activeRecoveryRef = useRef(null);
    const lastRecoveryRequestRef = useRef(null);

    /* When the mark went up, and the pending timer (if any) topping up its minimum visible time. */
    const reconnectingShownAtRef = useRef(null);
    const clearReconnectingTimeoutRef = useRef(null);

    const cancelScheduledReconnectingClear = useCallback(() => {
        if (clearReconnectingTimeoutRef.current) {
            clearTimeout(clearReconnectingTimeoutRef.current);
            clearReconnectingTimeoutRef.current = null;
        }
    }, []);

    /*
     * A completed/failed recovery calls this instead of clearing the mark directly, so the
     * banner still reads as having been shown for at least MINIMUM_RECONNECTING_VISIBLE_MILLISECONDS
     * even when the actual reconnect was near-instant.
     */
    const scheduleReconnectingClear = useCallback(() => {
        cancelScheduledReconnectingClear();

        const shownAtMilliseconds = reconnectingShownAtRef.current ?? 0;
        const remainingMilliseconds = MINIMUM_RECONNECTING_VISIBLE_MILLISECONDS - (Date.now() - shownAtMilliseconds);

        if (remainingMilliseconds <= 0) {
            clearReconnectingMark();

            return;
        }

        clearReconnectingTimeoutRef.current = setTimeout(() => {
            clearReconnectingTimeoutRef.current = null;
            clearReconnectingMark();
        }, remainingMilliseconds);
    }, [cancelScheduledReconnectingClear, clearReconnectingMark]);

    const cancelActiveRecovery = useCallback(() => {
        const activeRecovery = activeRecoveryRef.current;

        if (!activeRecovery) {
            return;
        }

        activeRecovery.cancelled = true;
        activeRecovery.unsubscribe?.();

        if (activeRecovery.timeoutId) {
            clearTimeout(activeRecovery.timeoutId);
        }

        activeRecoveryRef.current = null;
        setRecovering(false);
        cancelScheduledReconnectingClear();
        clearReconnectingMark();
    }, [cancelScheduledReconnectingClear, clearReconnectingMark]);

    useEffect(() => {
        return () => {
            cancelActiveRecovery();
            cancelScheduledReconnectingClear();
        };
    }, [cancelActiveRecovery, cancelScheduledReconnectingClear]);

    const runRecovery = useCallback(async (recoveryToken, {recoveryChatId, userMessageId, lastEventId, onResumeChunk}) => {
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
                const resumeOutcome = await attemptResume(recoveryChatId, lastEventId, onResumeChunk);

                if (recoveryToken.cancelled) {
                    return;
                }

                if (resumeOutcome === RESUME_STREAMED) {
                    /* `done` already finalized the bubble; this only clears the reconnecting mark. */
                    stopStreamingLastAIMessage();
                    scheduleReconnectingClear();
                    finishRecovery(false);

                    return;
                }

                if (resumeOutcome === RESUME_ALREADY_COMPLETE) {
                    stopStreamingLastAIMessage();
                    scheduleReconnectingClear();
                    await reloadChatHistory();

                    if (recoveryToken.cancelled) {
                        return;
                    }

                    finishRecovery(false);

                    return;
                }

                if (resumeOutcome === RESUME_REJECTED) {
                    stopStreamingLastAIMessage();
                    scheduleReconnectingClear();
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

                if (hasCompletedAssistantReply(chatDetails, userMessageId)) {
                    /*
                     * Order matters. The merge in useChatHistory deliberately preserves a
                     * *streaming* local bubble and discards the server's copy of it, which is
                     * exactly backwards here — clear the flag first so the server's text wins.
                     */
                    stopStreamingLastAIMessage();
                    scheduleReconnectingClear();
                    await reloadChatHistory();

                    if (recoveryToken.cancelled) {
                        return;
                    }

                    finishRecovery(false);

                    return;
                }
            }

            log.warn('[useStreamRecovery] Gave up waiting for the assistant reply.');
            stopStreamingLastAIMessage();
            scheduleReconnectingClear();
            finishRecovery(true);
        } catch (caughtError) {
            log.error('[useStreamRecovery] Recovery failed.', caughtError);
            stopStreamingLastAIMessage();
            scheduleReconnectingClear();
            finishRecovery(true);
        }
    }, [reloadChatHistory, stopStreamingLastAIMessage, scheduleReconnectingClear]);

    const beginRecovery = useCallback((recoveryRequest) => {
        if (!recoveryRequest?.recoveryChatId) {
            return false;
        }

        cancelActiveRecovery();

        /*
         * A prior recovery's clear may still be pending (it resolved fast and is topping up its
         * own minimum visible time) — that timer must not fire mid-way through this new one.
         */
        cancelScheduledReconnectingClear();

        lastRecoveryRequestRef.current = recoveryRequest;

        const recoveryToken = {cancelled: false, unsubscribe: null, timeoutId: null};
        activeRecoveryRef.current = recoveryToken;

        setRecovering(true);
        setRecoveryFailed(false);
        reconnectingShownAtRef.current = Date.now();
        markLastAIMessageReconnecting(true);

        /* Fire-and-forget by design — runRecovery handles its own failures and never rejects. */
        void runRecovery(recoveryToken, recoveryRequest);

        return true;
    }, [cancelActiveRecovery, cancelScheduledReconnectingClear, markLastAIMessageReconnecting, runRecovery]);

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

/*
 * A resumed stream that ends without a terminal frame died the same way the original did, so it
 * is reported as unavailable and recovery falls through to reconciling from history.
 */
async function attemptResume(recoveryChatId, lastEventId, onResumeChunk) {
    let sawTerminalFrame = false;

    try {
        const resumeOutcome = await chatService.chatStreamResume(recoveryChatId, lastEventId, {
            onChunk: (rawEvent) => {
                if (rawEvent?.event === DONE || rawEvent?.event === ERROR) {
                    sawTerminalFrame = true;
                }

                onResumeChunk(rawEvent);
            },
        });

        if (resumeOutcome === RESUME_STREAMED && !sawTerminalFrame) {
            return RESUME_UNAVAILABLE;
        }

        return resumeOutcome;
    } catch (caughtError) {
        log.warn('[useStreamRecovery] Resume failed; reconciling from history instead.', caughtError);

        return RESUME_UNAVAILABLE;
    }
}

function waitForMilliseconds(recoveryToken, delayMilliseconds) {
    return new Promise((resolve) => {
        recoveryToken.timeoutId = setTimeout(() => {
            recoveryToken.timeoutId = null;
            resolve();
        }, delayMilliseconds);
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
