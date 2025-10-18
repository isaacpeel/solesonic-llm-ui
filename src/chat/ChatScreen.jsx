import {useEffect, useState} from 'react';
import ConsoleErrors from "../common/ConsoleErrors";
import {useSharedData} from "../context/useSharedData.jsx";
import './ChatScreen.css';
import chatService from "../service/ChatService.js";
import {SharedDataContext} from "../context/SharedDataContext.jsx";
import ChatMessage, {USER, AI} from "./ChatMessage.jsx";
import ChatInput from "./ChatInput.jsx";


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


    // Add ephemeral message when chatHistory is empty
    useEffect(() => {
        if (chatHistory.length === 0) {
            const welcomeMessage = {
                type: AI,
                text: "Hi! How can I assist you today?",
                ephemeral: true,
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
        if (!inputValue.trim()) return;

        // Remove the ephemeral message before appending new user input
        const updatedHistory = chatHistory.filter(message => !message.ephemeral);
        const ts = Date.now() + Math.random().toString(36).slice(2);
        const userMessage = { type: USER, text: inputValue, _key: `user-${ts}` };

        // Append user message and a placeholder AI message for streaming
        const aiPlaceholder = { type: AI, text: '', _key: `ai-${ts}` };
        setChatHistory([...updatedHistory, userMessage, aiPlaceholder]);
        setLoading(true);
        setInputValue('');

        if (sharedRef.chatInputRef.current) {
            sharedRef.chatInputRef.current.style.height = "auto";
        }

        setError(null);

        try {
            // Stream the response and update the last AI message incrementally
            let accumulated = '';
            await chatService.chatStream(inputValue, chatId, {
                onChunk: (chunk) => {
                    accumulated += chunk;
                    setChatHistory((prev) => {
                        // Update the last message (AI placeholder)
                        const newHistory = [...prev];
                        const lastIndex = newHistory.length - 1;

                        if (lastIndex >= 0 && newHistory[lastIndex].type === AI) {
                            newHistory[lastIndex] = { ...newHistory[lastIndex], text: accumulated };
                        }

                        return newHistory;
                    });
                },
            });

            // After streaming completes, reload history (to get model info and ensure sync)
            setReloadHistoryTrigger(prev => prev + 1);

            // If we don't yet have a chatId, try to derive it from the user's latest history
            if (!chatId) {
                try {
                    const history = await chatService.findChatHistory();

                    if (Array.isArray(history) && history.length > 0 && history[0].id) {
                        setChatId(history[0].id);
                    }

                } catch (error) {
                    // Non-fatal: inability to set chatId shouldn't break UI
                    console.debug('Could not infer chatId from history:', e);
                }
            }
        } catch (error) {
            console.error('[ChatScreen] Streaming error:', error);
            setError(error);
            
            // Remove the empty AI placeholder on error
            setChatHistory((prev) => {
                const newHistory = [...prev];
                const lastIndex = newHistory.length - 1;
                // Remove last message if it's an empty AI message (the placeholder)
                if (lastIndex >= 0 && newHistory[lastIndex].type === AI && !newHistory[lastIndex].text) {
                    newHistory.pop();
                }
                return newHistory;
            });
        } finally {
            setLoading(false);
            setTimeout(() => {
                sharedRef.chatInputRef.current?.focus();
            }, 300);
        }

        // Return true to indicate completion
        return true;
    };

    return (
        <div className="chat-app">
            {error && <ConsoleErrors error={error}/>}

            <div className="chat-content">
                {chatHistory.map((entry, index) => (
                    <ChatMessage key={entry._key ?? index} message={entry}/>
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
