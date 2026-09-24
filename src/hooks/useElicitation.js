import {useEffect, useRef} from 'react';
import elicitationService from '../service/ElicitationService.js';
import {AI} from '../chat/message/ChatMessage.jsx';

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
    appendErrorMessage,
}) {
    /*
     * Progress steps that streamed onto the placeholder before the tool asked its question
     * belong to the same turn as whatever streams after the answer — captured here rather than
     * discarded with the placeholder below, so the final AI bubble ends up with the full step
     * list instead of only the steps that happened to stream after resubmission. A page reload
     * already shows every step because fetchFormattedChatMessages (useChatHistory.js) accumulates
     * progress frames across the whole turn with no such placeholder boundary; this keeps the
     * live view consistent with that.
     */
    const carriedNotificationsRef = useRef([]);

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
                carriedNotificationsRef.current = Array.isArray(lastMessage.notifications)
                    ? lastMessage.notifications
                    : [];
                newHistory.pop();
            }

            return newHistory;
        });
    }, [activeElicitation, setChatHistory]);

    const handleElicitationChange = (fieldName, fieldValue) => {
        elicitationService.handleElicitationChange(fieldName, fieldValue, setElicitationValues);
    };

    const handleElicitationSubmit = async (overrideFields) => {
        const carriedNotifications = carriedNotificationsRef.current;
        carriedNotificationsRef.current = [];

        await elicitationService.handleElicitationSubmit({
            overrideFields,
            activeElicitation,
            elicitationValues,
            chatHistory,
            setChatHistory,
            setActiveElicitation,
            setElicitationSubmitting,
            appendErrorMessage,
            handleStreamChunk,
            carriedNotifications,
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
