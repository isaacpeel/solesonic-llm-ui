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
            setChatHistory(formattedMessages);
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
        if (!chatId && response?.id) {
            setChatId(response.id);
        }
    }, [chatId, setChatId]);

    return {
        chatId,
        chatHistory,
        setChatHistory,
        setChatId,
        appendToLastAIMessage,
        finalizeLastAIMessage,
        ensureChatIdFromResponse,
    };
}

export default useChatHistory;
