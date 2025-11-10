import axiosClient from "../client/AxiosClient.js"
import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";
import { parseSSELines } from "./SeeService.js";

const chatService = {
    // Non-streaming chat (kept for backward compatibility)
    chat: async (userMessage, chatId) => {
        const accessToken = await authService.getAccessToken();
        const userId = await authService.getUserId();
        const options = axiosClient.setAuthHeader(accessToken);
        const chatBody = {chatMessage: userMessage};

        if (chatId) {
            // Continue an existing chat
            const uri = `${config.chatsUri}/${chatId}`;
            return await axiosClient.put(uri, chatBody, options);
        }

        // Start a new chat for the user
        const uri = `${config.chatsUri}/users/${userId}`;
        return await axiosClient.post(uri, chatBody, options);
    },

    // Handle streaming chunks including SSE frames for chunk/done/elicitation
    handleStreamChunk: (raw, {
        activeElicitation,
        chatId,
        appendToLastAIMessage,
        ensureChatIdFromResponse,
        finalizeLastAIMessage,
        setActiveElicitation,
        setElicitationSubmitting,
        setElicitationValues,
    }) => {
        const frames = parseSSELines(raw);

        if (frames.length === 0) {

            if (activeElicitation) {
                setActiveElicitation(null);
                setElicitationSubmitting(false);
            }

            appendToLastAIMessage(String(raw));
            return;
        }

        for (const { event, data } of frames) {
            if (event === 'chunk' || event === 'message') {

                if (activeElicitation) {
                    setActiveElicitation(null);
                    setElicitationSubmitting(false);
                }

                appendToLastAIMessage(data);
            } else if (event === 'done') {
                try {
                    const parsed = JSON.parse(data);
                    ensureChatIdFromResponse(parsed);
                    finalizeLastAIMessage(parsed);
                } catch (parseError) {
                    console.error('[ChatService] Failed to parse done payload:', parseError);
                }

                setActiveElicitation(null);
                setElicitationSubmitting(false);
            } else if (event === 'elicitation') {
                try {
                    const elicitation = JSON.parse(data);

                    setElicitationSubmitting(false);
                    setActiveElicitation(elicitation);

                    const schema = elicitation.requestedSchema || {};
                    const properties = schema.properties || {};
                    const initialValues = {};

                    for (const propertyName of Object.keys(properties)) {
                        if (propertyName === 'chatId') {
                            initialValues[propertyName] = elicitation?._meta?.chatId || elicitation?.chatId || chatId || '';
                        } else {
                            initialValues[propertyName] = '';
                        }
                    }

                    setElicitationValues(initialValues);
                } catch (parseError) {
                    console.error('[ChatService] Failed to parse elicitation payload:', parseError);
                }
            }
        }
    },

    // Streaming chat using text/event-stream per OpenAPI spec
    chatStream: async (userMessage, chatId, { onChunk } = {}) => {
        const token = await authService.getAccessToken();
        const userId = await authService.getUserId();

        // Accept either a plain string (wrapped as { chatMessage }) or a structured object (sent as-is)
        const payload = (typeof userMessage === 'string')
            ? { chatMessage: userMessage }
            : userMessage;
        const body = JSON.stringify(payload);

        const uri = chatId
            ? `${config.streamingChatsUri}/${chatId}`
            : `${config.streamingChatsUri}/users/${userId}`;

        const method = chatId ? 'PUT' : 'POST';

        let response;
        try {
            response = await fetch(uri, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream'
                },
                body,
                mode: 'cors',
                credentials: 'same-origin'
            });
        } catch (fetchError) {
            console.error('[ChatService] Fetch failed:', {
                uri,
                method,
                error: fetchError.message,
                stack: fetchError.stack
            });
            throw new Error(`Failed to connect to streaming endpoint: ${fetchError.message}`);
        }

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unable to read error response');
            console.error('[ChatService] Streaming request failed:', {
                status: response.status,
                statusText: response.statusText,
                uri,
                method,
                errorBody: errorText
            });
            throw new Error(`Streaming request failed: ${response.status} ${response.statusText}. ${errorText}`);
        }

        if (!response.body) {
            console.error('[ChatService] Response body is null or undefined');
            throw new Error('Streaming response has no body - server may not support streaming');
        }

        console.debug('[ChatService] Streaming connection established:', { uri, method });

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                let boundaryIndex;
                while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
                    const eventBlock = buffer.slice(0, boundaryIndex);
                    buffer = buffer.slice(boundaryIndex + 2);

                    if (onChunk) {
                        const payload = eventBlock.trim();
                        if (payload) {
                            onChunk(payload);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }


        // Return raw response in case caller wants headers (e.g., new chat id via header)
        return response;
    },

    findChatDetails: async (chatId) => {
        const accessToken = await authService.getAccessToken();
        const uri = `${config.chatsUri}/${chatId}`;
        const options = axiosClient.setAuthHeader(accessToken);

        return await axiosClient.get(uri, options);
    },

    findChatHistory: async () => {
        const accessToken = await authService.getAccessToken();
        const userId = await authService.getUserId();
        const uri = `${config.chatsUri}/users/${userId}`;
        const options = axiosClient.setAuthHeader(accessToken);

        return await axiosClient.get(uri, options);
    },


}

export default chatService;
