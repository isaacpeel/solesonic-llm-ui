import {createContext, useCallback, useEffect, useRef, useState} from 'react';
import {useSharedData} from './useSharedData.jsx';
import useChatStream from '../hooks/useChatStream.js';
import useChatHistoryMutations from '../hooks/useChatHistoryMutations.js';
import {reloadChatHistoryInto} from '../hooks/useChatHistory.js';

const ChatTurnContext = createContext(null);

/*
 * Owns the turn in flight above the router, so leaving the chat screen for settings neither
 * aborts the stream nor strands its frames in an unmounted component.
 */
export function ChatTurnProvider({children}) {
    const {chatId, setChatId, chatHistory, setChatHistory, adoptedChatIdRef, setStreamingChatId} = useSharedData();
    const historyMutations = useChatHistoryMutations({setChatHistory, setChatId, adoptedChatIdRef});

    const [activeElicitation, setActiveElicitation] = useState(null);
    const [elicitationValues, setElicitationValues] = useState({});
    const [elicitationSubmitting, setElicitationSubmitting] = useState(false);
    const getSelectedCommandRef = useRef(null);
    const getMessageTextRef = useRef(null);

    const reloadChatHistory = useCallback(async (targetChatId = chatId) => {
        if (!targetChatId) {
            return;
        }

        return await reloadChatHistoryInto(targetChatId, setChatHistory);
    }, [chatId, setChatHistory]);

    const chatStream = useChatStream({
        chatId,
        chatHistory,
        setChatHistory,
        ...historyMutations,
        reloadChatHistory,
        activeElicitation,
        setActiveElicitation,
        setElicitationSubmitting,
        setElicitationValues,
        getSelectedCommandRef,
        getMessageTextRef,
    });

    const {turnInProgress, abortActiveStream} = chatStream;

    const releaseTurn = useCallback(() => {
        abortActiveStream();
        setActiveElicitation(null);
        setElicitationSubmitting(false);
        setElicitationValues({});
    }, [abortActiveStream]);

    useEffect(() => {
        setStreamingChatId(turnInProgress ? chatId : null);
    }, [turnInProgress, chatId, setStreamingChatId]);

    useEffect(() => {
        if (!turnInProgress) {
            adoptedChatIdRef.current = null;
        }
    }, [turnInProgress, adoptedChatIdRef]);

    const previousChatIdRef = useRef(chatId);
    const turnInProgressRef = useRef(turnInProgress);
    turnInProgressRef.current = turnInProgress;

    useEffect(() => {
        const previousChatId = previousChatIdRef.current;
        previousChatIdRef.current = chatId;

        if (chatId === previousChatId || adoptedChatIdRef.current === chatId) {
            return;
        }

        if (turnInProgressRef.current) {
            setChatHistory([]);
        }

        releaseTurn();
    }, [chatId, adoptedChatIdRef, releaseTurn, setChatHistory]);

    return (
        <ChatTurnContext.Provider value={{
            ...chatStream,
            releaseTurn,
            activeElicitation, setActiveElicitation,
            elicitationValues, setElicitationValues,
            elicitationSubmitting, setElicitationSubmitting,
            getSelectedCommandRef,
            getMessageTextRef,
        }}>
            {children}
        </ChatTurnContext.Provider>
    );
}

export {ChatTurnContext};
