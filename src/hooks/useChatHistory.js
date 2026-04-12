import {useCallback, useEffect} from 'react';
import {useSharedData} from '../context/useSharedData.jsx';
import chatService from '../service/ChatService.js';
import {AI} from '../chat/ChatMessage.jsx';

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

            return response.chatMessages.map((message, index) => {
                return {
                    type: message.messageType,
                    text: message.message,
                    model: message.model,
                    _key: message.id ?? `${chatId || 'new'}-${index}`,
                };
            });
        }

        fetchChatDetails().then((formattedMessages) => {
            setChatHistory((previousHistory) => {
                return mergeFetchedChatHistoryWithLocalNotifications(formattedMessages, previousHistory);
            });
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

    const ensureChatIdFromResponse = useCallback((response) => {
        if (response?.id) {
            setChatId((currentChatId) => {
                if (!currentChatId) {
                    return response.id;
                }

                return currentChatId;
            });
        }
    }, [setChatId]);

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
