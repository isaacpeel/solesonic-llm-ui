import {useEffect} from 'react';
import elicitationService from '../service/ElicitationService.js';
import {AI} from '../chat/ChatMessage.jsx';

function useElicitation({
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
}) {
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

    return {
        activeElicitation,
        setActiveElicitation,
        elicitationValues,
        setElicitationValues,
        elicitationSubmitting,
        setElicitationSubmitting,
        handleElicitationChange,
        handleElicitationSubmit,
    };
}

export default useElicitation;
