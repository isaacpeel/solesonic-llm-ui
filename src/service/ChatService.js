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
        const body = JSON.stringify({ chatMessage: userMessage });

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

                // Process SSE messages split by double newline
                let boundaryIndex;
                while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
                    const rawEvent = buffer.slice(0, boundaryIndex);
                    buffer = buffer.slice(boundaryIndex + 2);

                    // Extract data lines (supports multi-line data:)
                    const dataLines = rawEvent
                        .split(/\r?\n/)
                        .filter(line => line.startsWith('data:'))
                        .map(line => line.replace(/^data:\s?/, ''));

                    if (dataLines.length && onChunk) {
                        // The backend spec says array of strings; emit each as it comes
                        for (const chunk of dataLines) {
                            onChunk(chunk);
                        }
                    }
                }
            }

            // Flush any remaining data (in case stream didn't end with \n\n)
            if (buffer.trim().length) {
                const trailing = buffer
                    .split(/\r?\n/)
                    .filter(line => line.startsWith('data:'))
                    .map(line => line.replace(/^data:\s?/, ''));
                if (trailing.length && onChunk) {
                    for (const chunk of trailing) onChunk(chunk);
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
    }
}

export default chatService;
