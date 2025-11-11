import {useCallback, useEffect, useState} from 'react';
import ConsoleErrors from "../common/ConsoleErrors";
import {useSharedData} from "../context/useSharedData.jsx";
import './ChatScreen.css';
import chatService from "../service/ChatService.js";
import streamService from "../service/StreamService.js";
import {SharedDataContext} from "../context/SharedDataContext.jsx";
import ChatMessage, {AI, SYSTEM, USER} from "./ChatMessage.jsx";
import ChatInput from "./ChatInput.jsx";
import {toJsx} from "../util/htmlFunctions.jsx";
import ElicitationPrompt from "./ElicitationPrompt.jsx";


function ChatScreen() {
    const {chatId, setChatId} = useSharedData(null);
    const {chatHistory, setChatHistory} = useSharedData([]);
    const sharedRef = useSharedData(SharedDataContext);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [inputValue, setInputValue] = useState('');

    // MCP elicitation state
    const [activeElicitation, setActiveElicitation] = useState(null);
    const [elicitationValues, setElicitationValues] = useState({});
    const [elicitationSubmitting, setElicitationSubmitting] = useState(false);

    const handleInputChange = (event) => {
        setInputValue(event.target.value);
    };

    // Helper to append streaming text to the last AI message
    const appendToLastAIMessage = (textToAppend) => {
        setChatHistory((previousHistory) => {
            const lastIndex = previousHistory.length - 1;

            if (lastIndex < 0) {
                return previousHistory;
            }

            const newHistory = [...previousHistory];
            const lastMessage = newHistory[lastIndex];

            if (lastMessage.type === AI) {
                newHistory[lastIndex] = {
                    ...lastMessage,
                    text: (lastMessage.text || '') + String(textToAppend),
                };
            }

            return newHistory;
        });
    };

    // Helper to ensure chatId exists when backend returns it
    const ensureChatIdFromResponse = (response) => {
        if (!chatId && response?.id) {
            setChatId(response.id);
        }
    };

    // Helper to finalize the last AI message with final content and metadata
    const finalizeLastAIMessage = (response) => {
        setChatHistory((previousHistory) => {
            const newHistory = [...previousHistory];
            const lastIndex = newHistory.length - 1;

            if (lastIndex >= 0 && newHistory[lastIndex].type === AI) {
                const finalText = response?.message?.message ?? newHistory[lastIndex].text;
                newHistory[lastIndex] = {
                    ...newHistory[lastIndex],
                    text: finalText,
                    formattedText: toJsx(finalText),
                    model: response?.message?.model ?? newHistory[lastIndex].model,
                    isStreaming: false,
                };
            }

            return newHistory;
        });
    };

    // Handle streaming chunks including SSE frames for chunk/done/elicitation
    const handleStreamChunk = useCallback((raw) => {
        chatService.handleStreamChunk(raw, {
            activeElicitation,
            chatId,
            appendToLastAIMessage,
            ensureChatIdFromResponse,
            finalizeLastAIMessage,
            setActiveElicitation,
            setElicitationSubmitting,
            setElicitationValues,
        });
    }, [activeElicitation, chatId, appendToLastAIMessage, ensureChatIdFromResponse, finalizeLastAIMessage, setActiveElicitation, setElicitationSubmitting, setElicitationValues]);

    useEffect(() => {
        if (chatHistory.length === 0) {
            const welcomeMessage = {
                type: AI,
                text: "Hi! How can I assist you today?",
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

            return response.chatMessages.map((message, idx) => {
                return {
                    type: message.messageType,
                    text: message.message,
                    model: message.model,
                    _key: message.id ?? `${chatId || 'new'}-${idx}`,
                };
            });
        }

        fetchChatDetails().then(formattedMessages => {
            setChatHistory(formattedMessages)
        });
    }, [chatId, setChatHistory]);

    // When an elicitation prompt becomes active, remove any trailing empty AI placeholder
    useEffect(() => {
        if (!activeElicitation) {
            return;
        }

        setChatHistory((previousHistory) => {
            const lastIndex = previousHistory.length - 1;

            if (lastIndex < 0) {
                return previousHistory;
            }

            const newHistory = [...previousHistory];
            const lastMessage = newHistory[lastIndex];
            const lastMessageIsEmptyAI = lastMessage.type === AI && (!lastMessage.text || lastMessage.text.trim() === '');

            if (lastMessageIsEmptyAI) {
                newHistory.pop();
            }

            return newHistory;
        });
    }, [activeElicitation, setChatHistory]);

    const handleElicitationChange = (name, value) => {
        setElicitationValues((previous) => ({
            ...previous,
            [name]: value,
        }));
    };

    const handleElicitationSubmit = async (overrideFields) => {
        if (!activeElicitation) {
            return;
        }

        const fieldsToSend = {
            ...elicitationValues,
            ...(overrideFields || {}),
        };

        const ts = Date.now() + Math.random().toString(36).slice(2);

        const summaryParts = Object.entries(fieldsToSend)
            .filter(([key]) => key !== 'chatId')
            .map(([key, value]) => `${value}`);

        const updatedHistory = chatHistory.filter(message => !message.ephemeral);
        const systemElicitationMessage = { type: SYSTEM, text: activeElicitation.message, _key: `user-${ts}` };
        const userElicitationResponse = {type: USER, text: summaryParts.join(', ')};
        const aiPlaceholder = { type: AI, text: '', _key: `ai-${ts}`, isStreaming: true };

        setChatHistory([...updatedHistory, systemElicitationMessage, userElicitationResponse, aiPlaceholder]);

        setElicitationSubmitting(true);
        
        const elicitationId = activeElicitation.elicitationId;
        const chatId = activeElicitation.chatId;

        const responsePayload = {
            elicitationResponse: {
                name: activeElicitation.name,
                fields: { ...fieldsToSend },
            },
        };

        setError(null);

        try {
            await streamService.chatStreamElicitationResponse(responsePayload, chatId, elicitationId,{
                onChunk: handleStreamChunk,
            });
        } catch (error) {
            console.error('[ChatScreen] Elicitation streaming error:', error);
            setError(error);
            setChatHistory((previous) => {
                const newHistory = [...previous];
                const lastIndex = newHistory.length - 1;

                if (lastIndex >= 0 && newHistory[lastIndex].type === AI && !newHistory[lastIndex].text) {
                    newHistory.pop();
                } else if (lastIndex >= 0 && newHistory[lastIndex].type === AI) {
                    newHistory[lastIndex] = { ...newHistory[lastIndex], isStreaming: false };
                }

                return newHistory;
            });
        }

        setActiveElicitation(null);
        setElicitationSubmitting(false);
    };

    const handleSubmit = async () => {

        if (!inputValue.trim()) {
            return;
        }

        // Remove the ephemeral message before appending new user input
        const updatedHistory = chatHistory.filter(message => !message.ephemeral);
        const timestamp = Date.now() + Math.random().toString(36).slice(2);
        const userMessage = {type: USER, text: inputValue, _key: `user-${timestamp}`};

        const aiPlaceholder = {type: AI, text: '', _key: `ai-${timestamp}`, isStreaming: true};
        setChatHistory([...updatedHistory, userMessage, aiPlaceholder]);
        setLoading(true);
        setInputValue('');

        if (sharedRef.chatInputRef.current) {
            sharedRef.chatInputRef.current.style.height = "auto";
        }

        setError(null);

        try {
            await chatService.chatStream(inputValue, chatId, {
                onChunk: handleStreamChunk,
            });

        } catch (error) {
            console.error('[ChatScreen] Streaming error:', error);
            setError(error);
            setChatHistory((prev) => {
                const newHistory = [...prev];
                const lastIndex = newHistory.length - 1;

                if (lastIndex >= 0 && newHistory[lastIndex].type === AI && !newHistory[lastIndex].text) {
                    newHistory.pop();
                } else if (lastIndex >= 0 && newHistory[lastIndex].type === AI) {
                    newHistory[lastIndex] = {...newHistory[lastIndex], isStreaming: false};
                }
                return newHistory;
            });
        } finally {
            setLoading(false);
            setTimeout(() => {
                sharedRef.chatInputRef.current?.focus();
            }, 300);
        }

        return true;
    }

    return (
        <div className="chat-app">
            {error && <ConsoleErrors error={error}/>}

            <div className="chat-content">
                {chatHistory.map((entry) => (
                    <ChatMessage key={entry._key} message={entry}/>
                ))}

                {activeElicitation && (
                    <ElicitationPrompt
                        elicitation={activeElicitation}
                        values={elicitationValues}
                        onChange={handleElicitationChange}
                        onSubmit={handleElicitationSubmit}
                        submitting={elicitationSubmitting}
                    />
                )}

                <ChatInput
                    loading={loading}
                    inputValue={inputValue}
                    handleInputChange={handleInputChange}
                    handleSubmit={handleSubmit}
                    chatInputRef={sharedRef.chatInputRef}
                />
            </div>
        </div>
    );
}

export default ChatScreen;