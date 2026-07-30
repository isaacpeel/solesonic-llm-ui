import {useCallback, useEffect} from 'react';
import {useSharedData} from '../context/useSharedData.jsx';
import chatService from '../service/ChatService.js';
import {AI, SYSTEM, USER} from '../chat/ChatMessage.jsx';

function useChatHistory() {
    const {chatId, setChatId, chatHistory, setChatHistory} = useSharedData();

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

    useEffect(() => {
        if (!chatId) {
            return;
        }

        async function fetchChatDetails() {
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

        fetchChatDetails()
            .then((formattedMessages) => {
                setChatHistory((previousHistory) => {
                    return mergeFetchedChatHistoryWithLocalNotifications(formattedMessages, previousHistory);
                });
            })
            .catch((error) => {
                console.error('[useChatHistory] Failed to load chat details:', error);
            });
    }, [chatId, setChatHistory]);

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

                newHistory[lastIndex] = {
                    ...newHistory[lastIndex],
                    text: finalText,
                    model: response?.message?.model ?? newHistory[lastIndex].model,
                    isStreaming: false,
                };
            }

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
        finalizeLastAIMessage,
        ensureChatIdFromResponse,
        adoptMessageIdForLastUserMessage,
    };
}

export default useChatHistory;

function mergeFetchedChatHistoryWithLocalNotifications(fetchedHistory, previousHistory) {
    if (!Array.isArray(fetchedHistory)) {
        return previousHistory;
    }

    if (fetchedHistory.length === 0) {
        const lastLocalMessage = previousHistory[previousHistory.length - 1];
        const localNotifications = Array.isArray(lastLocalMessage?.notifications) ? lastLocalMessage.notifications : [];

        if (lastLocalMessage?.type === AI && localNotifications.length > 0) {
            return previousHistory;
        }

        return fetchedHistory;
    }

    const lastLocalMessage = previousHistory[previousHistory.length - 1];
    const localNotifications = Array.isArray(lastLocalMessage?.notifications) ? lastLocalMessage.notifications : [];

    if (lastLocalMessage?.type !== AI || localNotifications.length === 0) {
        return fetchedHistory;
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
