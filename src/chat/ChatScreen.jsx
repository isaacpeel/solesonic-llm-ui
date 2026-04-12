import {useRef, useState} from 'react';
import ConsoleErrors from "../common/ConsoleErrors";
import {useSharedData} from "../context/useSharedData.jsx";

import './ChatScreen.css';

import ChatMessage from "./ChatMessage.jsx";
import ChatInput from "./ChatInput.jsx";
import ElicitationPrompt from "../elicitation/ElicitationPrompt.jsx";
import useChatHistory from '../hooks/useChatHistory.js';
import useChatStream from '../hooks/useChatStream.js';
import useElicitation from '../hooks/useElicitation.js';
import useSlashCommands from '../hooks/useSlashCommands.js';


function ChatScreen() {
    const {chatInputRef} = useSharedData();
    const {chatId, chatHistory, setChatHistory, appendToLastAIMessage, appendNotificationToLastAIMessage, finalizeLastAIMessage, ensureChatIdFromResponse} = useChatHistory();
    const [activeElicitation, setActiveElicitation] = useState(null);
    const [elicitationValues, setElicitationValues] = useState({});
    const [elicitationSubmitting, setElicitationSubmitting] = useState(false);
    const getSelectedCommandRef = useRef(null);
    const getMessageTextRef = useRef(null);

    const {loading, error, setError, inputValue, setInputValue, handleInputChange, handleSubmit, handleStreamChunk} = useChatStream({
        chatId,
        chatHistory,
        setChatHistory,
        appendToLastAIMessage,
        appendNotificationToLastAIMessage,
        finalizeLastAIMessage,
        ensureChatIdFromResponse,
        activeElicitation,
        setActiveElicitation,
        setElicitationSubmitting,
        setElicitationValues,
        getSelectedCommandRef,
        getMessageTextRef,
    });

    const slashCommands = useSlashCommands({inputValue, setInputValue});
    getSelectedCommandRef.current = slashCommands.getSelectedCommand;
    getMessageTextRef.current = slashCommands.getMessageText;

    const {handleElicitationChange, handleElicitationSubmit} = useElicitation({
        chatHistory,
        setChatHistory,
        handleStreamChunk,
        activeElicitation,
        setActiveElicitation,
        elicitationValues,
        setElicitationValues,
        elicitationSubmitting,
        setElicitationSubmitting,
        setError,
    });

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
                    chatInputRef={chatInputRef}
                    ghostText={slashCommands.ghostText}
                    onTabAccept={slashCommands.handleTabAccept}
                />
            </div>
        </div>
    );
}

export default ChatScreen;