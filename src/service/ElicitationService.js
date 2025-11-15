import {AI, SYSTEM, USER} from "../chat/ChatMessage.jsx";
import streamService from "./StreamService.js";
import {useState} from "react";

const [activeElicitation, setActiveElicitation] = useState(null);
const [elicitationValues, setElicitationValues] = useState({});
const [elicitationSubmitting, setElicitationSubmitting] = useState(false);

const elicitationService = {
    handleElicitationChange:  (name, value) => {
        setElicitationValues((previous) => ({
            ...previous,
            [name]: value,
        }));
    },

    handleElicitationSubmit: async (overrideFields) => {
        if (!activeElicitation) {
            return;
        }

        const fieldsToSend = {
            ...elicitationValues,
            ...(overrideFields || {}),
        };

        const timestamp = Date.now() + Math.random().toString(36).slice(2);

        const summaryParts = Object.entries(fieldsToSend)
            .filter(([key]) => key !== 'chatId')
            .map(([, value]) => `${value}`);

        const updatedHistory = chatHistory.filter(message => !message.ephemeral);
        const systemElicitationMessage = { type: SYSTEM, text: activeElicitation.message, _key: `user-${timestamp}` };
        const userElicitationResponse = { type: USER, text: summaryParts.join(', '), _key: `user-${timestamp}-resp` };
        const aiPlaceholder = { type: AI, text: '', _key: `ai-${timestamp}`, isStreaming: true };

        setChatHistory([...updatedHistory, systemElicitationMessage, userElicitationResponse, aiPlaceholder]);

        setElicitationSubmitting(true);

        const elicitationId = activeElicitation.elicitationId;
        const chatId = activeElicitation.chatId;

        const responsePayload = {
            elicitationResponse: {
                name: activeElicitation.name,
                fields: { ...fieldsToSend },
            },
        };

        setError(null);

        try {
            await streamService.chatStreamElicitationResponse(responsePayload, chatId, elicitationId,{
                onChunk: handleStreamChunk,
            });
        } catch (error) {
            console.error('[ChatScreen] Elicitation streaming error:', error);
            setError(error);
            setChatHistory((previous) => {
                const newHistory = [...previous];
                const lastIndex = newHistory.length - 1;

                if (lastIndex >= 0 && newHistory[lastIndex].type === AI && !newHistory[lastIndex].text) {
                    newHistory.pop();
                } else if (lastIndex >= 0 && newHistory[lastIndex].type === AI) {
                    newHistory[lastIndex] = { ...newHistory[lastIndex], isStreaming: false };
                }

                return newHistory;
            });
        }

        setActiveElicitation(null);
        setElicitationSubmitting(false);
    },
}

export default elicitationService;