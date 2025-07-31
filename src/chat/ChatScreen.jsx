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
        if (!chatId) return; // Do not fetch if chatId is null

        async function fetchChatDetails() {
            const response = await chatService.findChatDetails(chatId);

            return response.chatMessages.map((message) => {
                return {
                    type: message.messageType,
                    text: message.message,
                    model: message.model,
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
        const userMessage = {type: USER, text: inputValue};

        setChatHistory([...updatedHistory, userMessage]);
        setLoading(true);
        setInputValue('');

        if (sharedRef.chatInputRef.current) {
            sharedRef.chatInputRef.current.style.height = "auto";
        }

        setError(null);

        try {
            const response = await chatService.chat(inputValue, chatId);

            const aiMessage = {
                type: response.message.messageType,
                text: response.message.message,
                model: response.message.model
            };
            setChatHistory(prevHistory => [...prevHistory, aiMessage]);
            setReloadHistoryTrigger(prev => prev + 1);

            if (!chatId && response.id) {
                setChatId(response.id);
            }
        } catch (error) {
            setError(error);
        } finally {
            setTimeout(() => {
                sharedRef.chatInputRef.current.focus();
            }, 1000);
        }

        // Set loading to false after all operations are complete
        setLoading(false);

        // Return true to indicate completion
        return true;
    };

    return (
        <div className="chat-app">
            {error && <ConsoleErrors error={error}/>}

            <div className="chat-content">
                {chatHistory.map((entry, index) => (
                    <ChatMessage key={index} message={entry}/>
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
