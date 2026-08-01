import {useCallback, useEffect, useRef} from 'react';
import {useSharedData} from '../context/useSharedData.jsx';
import chatService from '../service/ChatService.js';
import {normalizeGeneratedImage} from '../service/ImageGenerationService.js';
import {AI, SYSTEM, USER} from '../chat/message/ChatMessage.jsx';

function useChatHistory() {
    const {chatId, setChatId, chatHistory, setChatHistory} = useSharedData();

    /*
     * Holds an id this client adopted from its own in-flight stream, so hydration can tell
     * that case apart from the user picking a chat out of the sidebar — both are a bare
     * setChatId and are otherwise indistinguishable.
     */
    const adoptedChatIdRef = useRef(null);

    useEffect(() => {
        if (chatHistory.length === 0) {
            const welcomeMessage = {
                type: AI,
                text: 'Hi! How can I assist you today?',
                ephemeral: true,
                _key: `welcome-${Date.now()}`,
            };

            setChatHistory([welcomeMessage]);
        }
    }, [chatHistory, setChatHistory]);

    /*
     * Callable form of the hydration below, so stream recovery can pull the server's view of a
     * turn without going through `chatId` — the id is already set by then, and the
     * `adoptedChatIdRef` guard would suppress the effect anyway. Rejects on failure; the effect
     * catches, recovery decides for itself.
     */
    const reloadChatHistory = useCallback(async () => {
        if (!chatId) {
            return;
        }

        const formattedMessages = await fetchFormattedChatMessages(chatId);

        setChatHistory((previousHistory) => {
            return mergeFetchedChatHistoryWithLocalNotifications(formattedMessages, previousHistory);
        });
    }, [chatId, setChatHistory]);

    useEffect(() => {
        if (!chatId) {
            return;
        }

        /*
         * A new chat learns its id from its own `init` frame, milliseconds after the stream
         * opens. Hydrating on that transition would read a server state holding only the USER
         * message — the streaming placeholder would be replaced, and every later frame would
         * land on a USER entry where appendToLastAIMessage/finalizeLastAIMessage drop it in
         * silence. Skip exactly that one transition; a real sidebar selection still hydrates.
         */
        if (adoptedChatIdRef.current === chatId) {
            return;
        }

        /*
         * Cleared only on the fetching path, so this stays correct if the user later navigates
         * away and back to the same chat, and so React StrictMode's double-invoked effect takes
         * the same branch both times.
         */
        adoptedChatIdRef.current = null;

        reloadChatHistory()
            .catch((error) => {
                console.error('[useChatHistory] Failed to load chat details:', error);
            });
    }, [chatId, reloadChatHistory]);

    const appendToLastAIMessage = useCallback((textToAppend) => {
        setChatHistory((previousHistory) => {
            const lastIndex = previousHistory.length - 1;

            if (lastIndex < 0) {
                return previousHistory;
            }

            const newHistory = [...previousHistory];
            const lastChatMessage = newHistory[lastIndex];

            if (lastChatMessage.type === AI) {
                const joinedMessage = `${lastChatMessage.text}${textToAppend}`;

                newHistory[lastIndex] = {
                    ...lastChatMessage,
                    text: joinedMessage,
                };
            }

            return newHistory;
        });
    }, [setChatHistory]);

    const finalizeLastAIMessage = useCallback((response) => {
        setChatHistory((previousHistory) => {
            const newHistory = [...previousHistory];
            const lastIndex = newHistory.length - 1;

            if (lastIndex >= 0 && newHistory[lastIndex].type === AI) {
                let finalText = response?.message?.message ?? newHistory[lastIndex].text;

                if (typeof finalText === 'string') {
                    finalText = finalText
                        .replace(/\r\n/g, '\n')
                        .replace(/\n{3,}/g, '\n\n');
                }

                /*
                 * The backend emits a progress frame for every image it describes, so a seed
                 * still standing at `done` means no image was read. Rendering it as a completed
                 * step would put a green checkmark claiming the image was read directly above an
                 * assistant asking for one — drop it and flag the turn instead.
                 *
                 * Errs towards silence: any progress frame at all clears the seed, so an MCP tool
                 * step arriving first hides a genuine vision failure. A missed warning is a far
                 * better failure than one fired on a healthy turn.
                 */
                const seedWasNeverFulfilled = !!newHistory[lastIndex].hasSeededNotification;

                newHistory[lastIndex] = {
                    ...newHistory[lastIndex],
                    text: finalText,
                    model: response?.message?.model ?? newHistory[lastIndex].model,
                    isStreaming: false,
                    notifications: seedWasNeverFulfilled ? [] : newHistory[lastIndex].notifications,
                    hasSeededNotification: false,
                    visionStepUnconfirmed: seedWasNeverFulfilled,
                };
            }

            return newHistory;
        });
    }, [setChatHistory]);

    /*
     * Rewrites the seeded placeholder in place. `hasSeededNotification` deliberately stays set,
     * so a real progress frame still replaces the text and `finalizeLastAIMessage` can still tell
     * that none ever arrived.
     */
    const updateSeededNotificationText = useCallback((notificationMessageText) => {
        setChatHistory((previousHistory) => {
            const lastIndex = previousHistory.length - 1;

            if (lastIndex < 0) {
                return previousHistory;
            }

            const lastMessage = previousHistory[lastIndex];

            if (lastMessage.type !== AI || !lastMessage.hasSeededNotification) {
                return previousHistory;
            }

            const newHistory = [...previousHistory];
            newHistory[lastIndex] = {
                ...lastMessage,
                notifications: [notificationMessageText],
            };

            return newHistory;
        });
    }, [setChatHistory]);

    /*
     * Only `done` clears the streaming flag on the normal path, so a stream that ends without it
     * would otherwise spin forever. Callers use this when they have decided the turn is over.
     */
    const attachGeneratedImagesToLastAIMessage = useCallback((generatedImages) => {
        if (!Array.isArray(generatedImages) || generatedImages.length === 0) {
            return;
        }

        setChatHistory((previousHistory) => {
            const lastIndex = previousHistory.length - 1;

            if (lastIndex < 0 || previousHistory[lastIndex].type !== AI) {
                return previousHistory;
            }

            const lastMessage = previousHistory[lastIndex];
            const existingImages = Array.isArray(lastMessage.generatedImages) ? lastMessage.generatedImages : [];
            const knownImageIds = new Set(existingImages.map((existingImage) => existingImage.imageId));

            /* `done` can repeat what an earlier `image` frame already delivered. */
            const newImages = generatedImages.filter((generatedImage) => !knownImageIds.has(generatedImage.imageId));

            if (newImages.length === 0) {
                return previousHistory;
            }

            const newHistory = [...previousHistory];
            newHistory[lastIndex] = {
                ...lastMessage,
                generatedImages: [...existingImages, ...newImages],
            };

            return newHistory;
        });
    }, [setChatHistory]);

    const stopStreamingLastAIMessage = useCallback(() => {
        setChatHistory((previousHistory) => {
            const lastIndex = previousHistory.length - 1;

            if (lastIndex < 0 || previousHistory[lastIndex].type !== AI) {
                return previousHistory;
            }

            const newHistory = [...previousHistory];
            /*
             * Clears the seed too. `finalizeLastAIMessage` infers a failed vision pass from a
             * seed still standing at `done`, but that inference is only valid when `done`
             * actually arrived — on every path that ends here it did not, so the turn is left
             * unflagged rather than accused.
             */
            newHistory[lastIndex] = {
                ...newHistory[lastIndex],
                isStreaming: false,
                isReconnecting: false,
                hasSeededNotification: false,
            };

            return newHistory;
        });
    }, [setChatHistory]);

    /*
     * Keeps the bubble streaming but marks why it is quiet. Must not touch `text` or `_key` —
     * the tokens already on screen stay, and a changed key would remount the bubble.
     */
    const markLastAIMessageReconnecting = useCallback((isReconnecting) => {
        setChatHistory((previousHistory) => {
            const lastIndex = previousHistory.length - 1;

            if (lastIndex < 0 || previousHistory[lastIndex].type !== AI) {
                return previousHistory;
            }

            const lastMessage = previousHistory[lastIndex];

            if (!!lastMessage.isReconnecting === !!isReconnecting) {
                return previousHistory;
            }

            const newHistory = [...previousHistory];
            newHistory[lastIndex] = {...lastMessage, isReconnecting: !!isReconnecting};

            return newHistory;
        });
    }, [setChatHistory]);

    /*
     * The `init` frame has been observed carrying the chat id under `id`; the attachment
     * design document specifies `chatId`. Accept both — guessing wrong means a new chat
     * never adopts an id and every follow-up turn silently starts a fresh chat.
     */
    const ensureChatIdFromResponse = useCallback((response) => {
        const resolvedChatId = response?.id ?? response?.chatId;

        if (resolvedChatId) {
            /* Marked before the state change so hydration sees it on the resulting effect run. */
            adoptedChatIdRef.current = resolvedChatId;

            setChatId((currentChatId) => {
                if (!currentChatId) {
                    return resolvedChatId;
                }

                return currentChatId;
            });
        }
    }, [setChatId]);

    /*
     * Walks back to the last USER entry and records the server's message id on it. Must not
     * touch `_key` — React would remount the bubble and the thumbnails would flicker.
     */
    const adoptMessageIdForLastUserMessage = useCallback((messageId) => {
        if (!messageId) {
            return;
        }

        setChatHistory((previousHistory) => {
            for (let messageIndex = previousHistory.length - 1; messageIndex >= 0; messageIndex -= 1) {
                if (previousHistory[messageIndex].type === USER) {
                    const newHistory = [...previousHistory];
                    newHistory[messageIndex] = {...newHistory[messageIndex], messageId};

                    return newHistory;
                }
            }

            return previousHistory;
        });
    }, [setChatHistory]);

    const appendNotificationToLastAIMessage = useCallback((notificationMessageText) => {
        if (!notificationMessageText || typeof notificationMessageText !== 'string') {
            return;
        }

        const trimmedNotificationMessageText = notificationMessageText.trim();

        if (!trimmedNotificationMessageText) {
            return;
        }

        setChatHistory((previousHistory) => {
            const newHistory = [...previousHistory];
            const lastMessageIndex = newHistory.length - 1;

            if (lastMessageIndex < 0) {
                return previousHistory;
            }

            const lastMessage = newHistory[lastMessageIndex];

            if (lastMessage.type !== AI) {
                return previousHistory;
            }

            const existingNotifications = Array.isArray(lastMessage.notifications)
                ? lastMessage.notifications
                : [];

            /*
             * A seeded step is a local placeholder covering the silent gap before the first
             * real progress frame. The first real frame replaces it rather than stacking on
             * top, so the finished log contains only steps the backend actually reported.
             */
            if (lastMessage.hasSeededNotification) {
                newHistory[lastMessageIndex] = {
                    ...lastMessage,
                    notifications: [trimmedNotificationMessageText],
                    hasSeededNotification: false,
                };

                return newHistory;
            }

            newHistory[lastMessageIndex] = {
                ...lastMessage,
                notifications: [...existingNotifications, trimmedNotificationMessageText],
            };

            return newHistory;
        });
    }, [setChatHistory]);

    return {
        chatId,
        chatHistory,
        setChatHistory,
        setChatId,
        appendToLastAIMessage,
        appendNotificationToLastAIMessage,
        updateSeededNotificationText,
        attachGeneratedImagesToLastAIMessage,
        stopStreamingLastAIMessage,
        markLastAIMessageReconnecting,
        finalizeLastAIMessage,
        ensureChatIdFromResponse,
        adoptMessageIdForLastUserMessage,
        reloadChatHistory,
    };
}

export default useChatHistory;

async function fetchFormattedChatMessages(chatId) {
    const response = await chatService.findChatDetails(chatId);

    const formattedMessages = [];
    let pendingProgressNotifications = [];

    response.chatMessages.forEach((message, index) => {
        if (message.progressData) {
            const notificationText = (message.progressData.message || message.message || '').trim();
            if (notificationText) {
                pendingProgressNotifications.push(notificationText);
            }
            return;
        }

        const base = {
            type: message.messageType,
            text: message.message,
            model: message.model,
            messageId: message.id,
            attachments: Array.isArray(message.attachments) ? message.attachments : [],
            /*
             * Only the reference is ever persisted (plan §5), so a reloaded turn
             * re-renders the stored image rather than regenerating it.
             */
            generatedImages: Array.isArray(message.generatedImages)
                ? message.generatedImages.map((generatedImage) => normalizeGeneratedImage(generatedImage))
                : [],
            _key: message.id ?? `${chatId || 'new'}-${index}`,
        };

        if (message.messageType === SYSTEM && message.elicitationId && message.elicitationResponse) {
            base.elicitationResponse = message.elicitationResponse.action;
        }

        if (message.messageType === AI && pendingProgressNotifications.length > 0) {
            base.notifications = pendingProgressNotifications;
            pendingProgressNotifications = [];
        }

        formattedMessages.push(base);
    });

    return formattedMessages;
}

function mergeFetchedChatHistoryWithLocalNotifications(fetchedHistory, previousHistory) {
    if (!Array.isArray(fetchedHistory)) {
        return previousHistory;
    }

    const lastLocalMessage = previousHistory[previousHistory.length - 1];
    const localNotifications = Array.isArray(lastLocalMessage?.notifications) ? lastLocalMessage.notifications : [];

    /*
     * A bubble that is still streaming outranks anything the server can report about it: its
     * turn is not persisted yet, so hydrating over it would discard the tokens already on
     * screen and unseat the AI entry the remaining frames append to.
     */
    const isLastLocalMessageStreaming = lastLocalMessage?.type === AI && !!lastLocalMessage.isStreaming;
    const shouldPreserveLastLocalMessage = lastLocalMessage?.type === AI
        && (isLastLocalMessageStreaming || localNotifications.length > 0);

    if (!shouldPreserveLastLocalMessage) {
        return fetchedHistory;
    }

    if (fetchedHistory.length === 0) {
        return previousHistory;
    }

    /*
     * Keep the live bubble itself — text, notifications and `_key` all intact, so no remount
     * and no lost tokens. Any trailing fetched AI row is the server's partial view of this
     * same turn, so it is dropped rather than rendered as a second bubble.
     */
    if (isLastLocalMessageStreaming) {
        const historyBeforeStreamingMessage = fetchedHistory[fetchedHistory.length - 1]?.type === AI
            ? fetchedHistory.slice(0, -1)
            : fetchedHistory;

        return [...historyBeforeStreamingMessage, lastLocalMessage];
    }

    const mergedHistory = [...fetchedHistory];
    const lastFetchedMessageIndex = mergedHistory.length - 1;
    const lastFetchedMessage = mergedHistory[lastFetchedMessageIndex];

    if (lastFetchedMessage?.type !== AI) {
        return [...mergedHistory, {
            ...lastLocalMessage,
            notifications: localNotifications,
        }];
    }

    mergedHistory[lastFetchedMessageIndex] = {
        ...lastFetchedMessage,
        notifications: localNotifications,
    };

    return mergedHistory;
}
