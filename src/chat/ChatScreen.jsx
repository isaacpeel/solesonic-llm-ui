import {useCallback, useEffect, useRef, useState} from 'react';
import ConsoleErrors from "../common/ConsoleErrors";
import {useSharedData} from "../context/useSharedData.jsx";

import './ChatScreen.css';

import {SharedDataContext} from "../context/SharedDataContext.jsx";
import ChatMessage, {AI, USER} from "./ChatMessage.jsx";
import ChatInput from "./ChatInput.jsx";
import {toJsx} from "../util/htmlFunctions.jsx";
import ElicitationPrompt from "./ElicitationPrompt.jsx";

import chatService from "../service/ChatService.js";
import streamService from "../service/StreamService.js"
import elicitationService from "../service/ElicitationService.js";


function ChatScreen() {
    const {chatId, setChatId} = useSharedData(null);
    const {chatHistory, setChatHistory} = useSharedData([]);
    const sharedRef = useSharedData(SharedDataContext);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [inputValue, setInputValue] = useState('');
    const [activeElicitation, setActiveElicitation] = useState(null);
    const [elicitationValues, setElicitationValues] = useState({});
    const [elicitationSubmitting, setElicitationSubmitting] = useState(false);
    const controller = useRef(null);

    const handleInputChange = (event) => {
        setInputValue(event.target.value);
    };

    // Helper to append streaming text to the last AI message
    // Formatting rules:
    // - Maintain a single canonical text buffer (no trimming, no manual spaces between chunks)
    // - Normalize line endings to \n
    // - Collapse absurd blank lines (3+ newlines -> 2)
    // - Strip leading newlines only at the very beginning of a new AI message
    // - Derive formattedText using the same pipeline as final rendering (toJsx)
    const appendToLastAIMessage = (textToAppend) => {
        setChatHistory((previousHistory) => {
            const lastIndex = previousHistory.length - 1;

            if (lastIndex < 0) {
                return previousHistory;
            }

            const newHistory = [...previousHistory];
            const lastMessage = newHistory[lastIndex];

            if (lastMessage.type === AI) {
                const incoming = String(textToAppend);

                // If this is the very beginning of an AI message, strip redundant leading newlines only once
                const isBeginningOfMessage = !lastMessage.text || lastMessage.text.length === 0;
                const incomingAdjusted = isBeginningOfMessage ? incoming.replace(/^\n+/, '') : incoming;

                // Build updated text without trimming (to keep model-intended spaces)
                const updatedRawText = (lastMessage.text || '') + incomingAdjusted;

                // Light-touch normalization for rendering stability during streaming
                let normalizedText = updatedRawText.replace(/\r\n/g, '\n');
                // Collapse 3+ consecutive newlines into exactly 2 (keep paragraph separation)
                normalizedText = normalizedText.replace(/\n{3,}/g, '\n\n');

                newHistory[lastIndex] = {
                    ...lastMessage,
                    text: normalizedText,
                    formattedText: toJsx(normalizedText),
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
    }, [
        activeElicitation,
        chatId,
        appendToLastAIMessage,
        ensureChatIdFromResponse,
        finalizeLastAIMessage,
        setActiveElicitation,
        setElicitationSubmitting,
        setElicitationValues]);

    const handleElicitationChange = (fieldName, fieldValue) => {
        elicitationService.handleElicitationChange(fieldName, fieldValue, setElicitationValues);
    };

    const handleElicitationSubmit = async (overrideFields) => {
        await elicitationService.handleElicitationSubmit({
            overrideFields,
            activeElicitation,
            elicitationValues,
            chatHistory,
            setChatHistory,
            setActiveElicitation,
            setElicitationSubmitting,
            setError,
            handleStreamChunk,
        });
    };

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
            controller.current?.abort();
            controller.current = new AbortController();

            await chatService.chatStream(inputValue, chatId, {
                signal: controller.current.signal,
                onChunk: handleStreamChunk,
            });

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('[ChatScreen] Stream aborted.');
                return;
            }

            streamService.handleStreamError(error, setError, setChatHistory, AI);
        } finally {
            setLoading(false);
            setTimeout(() => {
                sharedRef.chatInputRef.current?.focus();
            }, 300);
        }

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