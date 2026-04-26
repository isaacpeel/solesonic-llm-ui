import {AI, SYSTEM} from "../chat/ChatMessage.jsx";
import streamService from "./StreamService.js"


const DEFAULT_CONFIRMATION_ACTIONS = ['accept', 'cancel', 'decline'];

const elicitationService = {
    normalizeElicitationSchema: (requestedSchema) => {
        const schema = requestedSchema || {};
        const properties = schema.properties;

        if (properties !== undefined && Object.keys(properties).length === 0) {
            return {
                ...schema,
                properties: {
                    action: {
                        type: 'string',
                        enum: DEFAULT_CONFIRMATION_ACTIONS,
                    },
                },
            };
        }

        return schema;
    },

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
        const resolvedElicitationMessage = {
            type: SYSTEM,
            text: activeElicitation.message,
            elicitationResponse: summaryParts.join(', '),
            _key: `elicitation-${timestamp}`,
        };
        const aiPlaceholder = { type: AI, text: '', _key: `ai-${timestamp}`, isStreaming: true };

        setActiveElicitation(null);
        setChatHistory([...updatedHistory, resolvedElicitationMessage, aiPlaceholder]);

        setElicitationSubmitting(true);

        const elicitationId = activeElicitation.elicitationId;
        const chatId = activeElicitation.chatId;

        const payloadToSend = {
            ...fieldsToSend,
            elicitationId,
            chatId,
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