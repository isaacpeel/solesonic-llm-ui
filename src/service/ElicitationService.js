import {AI, SYSTEM, USER} from "../chat/ChatMessage.jsx";
import streamService from "./StreamService.js"


const elicitationService = {
    handleElicitationChange: (fieldName, fieldValue, setElicitationValues) => {
        setElicitationValues((previousValues) => ({
            ...previousValues,
            [fieldName]: fieldValue,
        }));
    },
    handleElicitationSubmit: async ({
        overrideFields,
        activeElicitation,
        elicitationValues,
        chatHistory,
        setChatHistory,
        setActiveElicitation,
        setElicitationSubmitting,
        setError,
        handleStreamChunk,
    }) => {
        
        if (!activeElicitation) {
            return;
        }

        const fieldsToSend = {
            ...elicitationValues,
            ...(overrideFields || {}),
        };

        const timestamp = Date.now() + Math.random().toString(36).slice(2);

        const summaryParts = Object.entries(fieldsToSend)
            .filter(([fieldKey]) => fieldKey !== 'chatId')
            .map(([, fieldValue]) => `${fieldValue}`);

        const updatedHistory = chatHistory.filter((message) => !message.ephemeral);
        const systemElicitationMessage = { type: SYSTEM, text: activeElicitation.message, _key: `user-${timestamp}` };
        const userElicitationResponse = { type: USER, text: summaryParts.join(', '), _key: `user-${timestamp}-resp` };
        const aiPlaceholder = { type: AI, text: '', _key: `ai-${timestamp}`, isStreaming: true };

        setActiveElicitation(null);
        setChatHistory([...updatedHistory, systemElicitationMessage, userElicitationResponse, aiPlaceholder]);

        setElicitationSubmitting(true);

        const elicitationId = activeElicitation.elicitationId;
        const chatId = activeElicitation.chatId;

        const payloadToSend = {
            ...fieldsToSend,
            elicitationId,
        };

        setError(null);

        try {
            await streamService.chatStreamElicitationResponse(payloadToSend, chatId, elicitationId, {
                onChunk: handleStreamChunk,
            });
        } catch (error) {
            streamService.handleStreamError(error, setError, setChatHistory);
        }

        setElicitationSubmitting(false);
    },
};

export default elicitationService;