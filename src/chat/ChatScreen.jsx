import {useEffect, useState} from 'react';
import ConsoleErrors from "../common/ConsoleErrors";
import {useSharedData} from "../context/useSharedData.jsx";
import './ChatScreen.css';
import chatService from "../service/ChatService.js";
import { parseSSELines } from "../service/SeeService.js";
import {SharedDataContext} from "../context/SharedDataContext.jsx";
import ChatMessage, {USER, AI} from "./ChatMessage.jsx";
import ChatInput from "./ChatInput.jsx";


function ChatScreen() {
    const {chatId, setChatId} = useSharedData(null);
    const {chatHistory, setChatHistory} = useSharedData([]);
    const sharedRef = useSharedData(SharedDataContext);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [inputValue, setInputValue] = useState('');

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
                newHistory[lastIndex] = {
                    ...newHistory[lastIndex],
                    text: response?.message?.message ?? newHistory[lastIndex].text,
                    model: response?.message?.model ?? newHistory[lastIndex].model,
                    isStreaming: false,
                };
            }

            return newHistory;
        });
    };

    // ... existing code ...
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

    const handleSubmit = async () => {

        if (!inputValue.trim()) {
            return;
        }

        // Remove the ephemeral message before appending new user input
        const updatedHistory = chatHistory.filter(message => !message.ephemeral);
        const ts = Date.now() + Math.random().toString(36).slice(2);
        const userMessage = {type: USER, text: inputValue, _key: `user-${ts}`};

        // Append user message and a placeholder AI message for streaming
        const aiPlaceholder = {type: AI, text: '', _key: `ai-${ts}`, isStreaming: true};
        setChatHistory([...updatedHistory, userMessage, aiPlaceholder]);
        setLoading(true);
        setInputValue('');

        if (sharedRef.chatInputRef.current) {
            sharedRef.chatInputRef.current.style.height = "auto";
        }

        setError(null);

        try {
            // Ensure we handle raw SSE properly, supporting both:
            // - onChunk receiving raw "event:.../data:..." strings
            // - onChunk receiving plain text tokens
            await chatService.chatStream(inputValue, chatId, {
                onChunk: (raw) => {
                    const frames = parseSSELines(raw);

                    if (frames.length === 0) {
                        appendToLastAIMessage(String(raw));
                        return;
                    }

                    for (const {event, data} of frames) {
                        if (event === 'chunk') {
                            appendToLastAIMessage(data);
                        } else if (event === 'done') {
                            try {
                                const parsed = JSON.parse(data);
                                ensureChatIdFromResponse(parsed);
                                finalizeLastAIMessage(parsed);
                            } catch {
                                // Non-JSON done payloads are ignored here; onDone will handle
                            }
                        }
                    }
                },
                onDone: (response) => {
                    
                    if (response && typeof response === 'string') {
                        try {
                            response = JSON.parse(response);
                        } catch {
                        }
                    }

                    ensureChatIdFromResponse(response);
                    finalizeLastAIMessage(response);
                },
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