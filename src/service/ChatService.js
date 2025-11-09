import axiosClient from "../client/AxiosClient.js"
import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";

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

    // Streaming POST specifically for elicitation responses: /{chatId}/elicitation-response
    chatStreamElicitationResponse: async (elicitationPayload, chatId, elicitationId, { onChunk } = {}) => {
        const token = await authService.getAccessToken();

        const payload = (typeof elicitationPayload === 'string')
            ? { chatMessage: elicitationPayload }
            : elicitationPayload;
        const body = JSON.stringify(payload);

        const uri = `${config.streamingChatsUri}/${chatId}/${elicitationId}/elicitation-response`;
        const method = 'POST';

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
            console.error('[ChatService] Fetch failed (elicitation):', {
                uri,
                method,
                error: fetchError.message,
                stack: fetchError.stack
            });
            throw new Error(`Failed to connect to elicitation streaming endpoint: ${fetchError.message}`);
        }

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unable to read error response');
            console.error('[ChatService] Elicitation streaming request failed:', {
                status: response.status,
                statusText: response.statusText,
                uri,
                method,
                errorBody: errorText
            });
            throw new Error(`Elicitation streaming request failed: ${response.status} ${response.statusText}. ${errorText}`);
        }

        if (!response.body) {
            console.error('[ChatService] Elicitation response body is null or undefined');
            throw new Error('Elicitation streaming response has no body - server may not support streaming');
        }

        console.debug('[ChatService] Elicitation streaming connection established:', { uri, method });

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });

                let boundaryIndex;
                while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
                    const eventBlock = buffer.slice(0, boundaryIndex);
                    buffer = buffer.slice(boundaryIndex + 2);

                    if (onChunk) {
                        const payloadChunk = eventBlock.trim();

                        if (payloadChunk) {
                            onChunk(payloadChunk);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        return response;
    }
}

export default chatService;
