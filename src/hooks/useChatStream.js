import {useCallback, useRef, useState} from 'react';
import log from 'loglevel';
import {useSharedData} from '../context/useSharedData.jsx';
import chatService from '../service/ChatService.js';
import streamService from '../service/StreamService.js';
import {AI, USER} from '../chat/ChatMessage.jsx';
import {generateMessageKey} from '../utils/keys.js';

function useChatStream({
    chatId,
    chatHistory,
    setChatHistory,
    appendToLastAIMessage,
    finalizeLastAIMessage,
    ensureChatIdFromResponse,
    activeElicitation,
    setActiveElicitation,
    setElicitationSubmitting,
    setElicitationValues,
}) {
    const {chatInputRef} = useSharedData();

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [inputValue, setInputValue] = useState('');
    const controller = useRef(null);

    const handleInputChange = (event) => {
        setInputValue(event.target.value);
    };

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
        setElicitationValues,
    ]);

    const handleStreamClose = useCallback((raw) => {
        chatService.handleFinalChunk(raw, {
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
        setElicitationValues,
    ]);

    const handleSubmit = async () => {
        if (!inputValue.trim()) {
            return;
        }

        const updatedHistory = chatHistory.filter((message) => !message.ephemeral);
        const userMessage = {type: USER, text: inputValue, _key: generateMessageKey('user')};
        const aiPlaceholder = {type: AI, text: '', _key: generateMessageKey('ai'), isStreaming: true};

        setChatHistory([...updatedHistory, userMessage, aiPlaceholder]);
        setLoading(true);
        setInputValue('');

        if (chatInputRef.current) {
            chatInputRef.current.style.height = 'auto';
        }

        setError(null);

        try {
            controller.current?.abort();
            controller.current = new AbortController();

            await chatService.chatStream(inputValue, chatId, {
                signal: controller.current.signal,
                onChunk: handleStreamChunk,
                onDone: handleStreamClose,
            });
        } catch (caughtError) {
            if (caughtError.name === 'AbortError') {
                log.info('[ChatScreen] Stream aborted.');
                return;
            }

            streamService.handleStreamError(caughtError, setError, setChatHistory);
        } finally {
            setLoading(false);
            setTimeout(() => {
                chatInputRef.current?.focus();
            }, 300);
        }
    };

    return {
        loading,
        error,
        setError,
        inputValue,
        handleInputChange,
        handleSubmit,
        handleStreamChunk,
    };
}

export default useChatStream;
