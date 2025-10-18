import {useEffect, useState} from 'react';
import ConsoleErrors from "../common/ConsoleErrors";
import {useSharedData} from "../context/useSharedData.jsx";
import './ChatScreen.css';
import chatService from "../service/ChatService.js";
import {SharedDataContext} from "../context/SharedDataContext.jsx";
import ChatMessage, {USER, AI} from "./ChatMessage.jsx";
import ChatInput from "./ChatInput.jsx";

// Helper to parse Server-Sent Events lines into {event, data}
function parseSSELines(raw) {
    // raw can contain multiple events like:
    // event:chunk\ndata:hello\n\nevent:chunk\n...
    const events = [];
    const blocks = String(raw).split(/\n\n+/); // separate SSE messages
    for (const block of blocks) {
        if (!block.trim()) continue;
        let evt = null;
        let data = '';
        for (const line of block.split('\n')) {
            if (line.startsWith('event:')) {
                evt = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
                data += (data ? '\n' : '') + line.slice(5); // preserve multi-line data
            }
        }
        if (evt || data) {
            events.push({event: evt ?? 'message', data: data});
        }
    }
    return events;
}

function ChatScreen() {
    const {chatId, setChatId} = useSharedData(null);
    const {chatHistory, setChatHistory} = useSharedData([]);
    const {setReloadHistoryTrigger} = useSharedData();
    const sharedRef = useSharedData(SharedDataContext);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [inputValue, setInputValue] = useState('');

    const handleInputChange = (event) => {
        setInputValue(event.target.value);
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
    // ... existing code ...

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
                    // Try to parse SSE frames; if none, treat as plain text token
                    const frames = parseSSELines(raw);
                    if (frames.length === 0) {
                        // Plain token append
                        setChatHistory((prev) => {
                            const lastIndex = prev.length - 1;
                            if (lastIndex < 0) return prev;
                            const newHistory = [...prev];
                            const lastMsg = newHistory[lastIndex];
                            if (lastMsg.type === AI) {
                                newHistory[lastIndex] = {
                                    ...lastMsg,
                                    text: (lastMsg.text || '') + String(raw),
                                };
                            }
                            return newHistory;
                        });
                        return;
                    }

                    for (const {event, data} of frames) {
                        if (event === 'chunk') {
                            // Append the chunk's data to the last AI message
                            setChatHistory((prev) => {
                                const lastIndex = prev.length - 1;
                                if (lastIndex < 0) return prev;
                                const newHistory = [...prev];
                                const lastMsg = newHistory[lastIndex];
                                if (lastMsg.type === AI) {
                                    newHistory[lastIndex] = {
                                        ...lastMsg,
                                        text: (lastMsg.text || '') + data,
                                    };
                                }
                                return newHistory;
                            });
                        } else if (event === 'done') {
                            // Some backends send final JSON in data with event:done
                            try {
                                const resp = JSON.parse(data);
                                if (!chatId && resp?.id) {
                                    setChatId(resp.id);
                                }
                                setChatHistory((prev) => {
                                    const newHistory = [...prev];
                                    const lastIndex = newHistory.length - 1;
                                    if (lastIndex >= 0 && newHistory[lastIndex].type === AI) {
                                        newHistory[lastIndex] = {
                                            ...newHistory[lastIndex],
                                            text: resp?.message?.message ?? newHistory[lastIndex].text,
                                            model: resp?.message?.model ?? newHistory[lastIndex].model,
                                            isStreaming: false,
                                        };
                                    }
                                    return newHistory;
                                });
                            } catch {
                                // If it's not JSON, ignore here; onDone will reconcile
                            }
                        }
                    }
                },
                onDone: (resp) => {
                    // resp.id is the new chatId, resp.message is your final ChatMessage
                    if (resp && typeof resp === 'string') {
                        // Support case where onDone receives raw JSON string
                        try {
                            resp = JSON.parse(resp);
                        } catch {
                        }
                    }

                    if (!chatId && resp?.id) {
                        setChatId(resp.id);
                    }
                    // Ensure the last AI message reflects final content or metadata
                    setChatHistory((prev) => {
                        const newHistory = [...prev];
                        const lastIndex = newHistory.length - 1;
                        if (lastIndex >= 0 && newHistory[lastIndex].type === AI) {
                            newHistory[lastIndex] = {
                                ...newHistory[lastIndex],
                                text: resp?.message?.message ?? newHistory[lastIndex].text,
                                model: resp?.message?.model ?? newHistory[lastIndex].model,
                                isStreaming: false,
                            };
                        }
                        return newHistory;
                    });
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