import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";

const streamService = {
    chatStreamElicitationResponse: async (
        elicitationPayload,
        chatId,
        elicitationId,
        { onChunk, timeoutMs = 30000 } = {} // 30s timeout by default
    ) => {
        const token = await authService.getAccessToken();

        const payload = (typeof elicitationPayload === 'string')
            ? { chatMessage: elicitationPayload }
            : elicitationPayload;

        const uri = `${config.streamingChatsUri}/${chatId}/${elicitationId}/elicitation-response`;
        const controller = new AbortController();
        const { signal } = controller;

        const body = JSON.stringify(payload);
        const method = 'POST';

        // Timeout logic
        const timeoutId = setTimeout(() => {
            controller.abort();
            console.error(`[ChatService] Streaming request timed out after ${timeoutMs}ms`);
        }, timeoutMs);

        let response;
        try {
            response = await fetch(uri, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                },
                body,
                mode: 'cors',
                credentials: 'same-origin',
                signal,
            });
        } catch (fetchError) {
            clearTimeout(timeoutId);
            console.error('[ChatService] Fetch failed (elicitation):', {
                uri,
                method,
                error: fetchError.message,
                stack: fetchError.stack,
            });
            throw new Error(`Failed to connect to elicitation streaming endpoint: ${fetchError.message}`);
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unable to read error response');
            console.error('[ChatService] Elicitation streaming request failed:', {
                status: response.status,
                statusText: response.statusText,
                uri,
                method,
                errorBody: errorText,
            });
            throw new Error(`Streaming request failed: ${response.status} ${response.statusText}. ${errorText}`);
        }

        if (!response.body) {
            console.error('[ChatService] Elicitation response body is null or undefined');
            throw new Error('Streaming response has no body - server may not support streaming');
        }

        console.debug('[ChatService] Streaming connection established:', { uri, method });

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        try {
            while (true) {
                let result;
                try {
                    result = await reader.read();
                } catch (readError) {
                    console.error('[ChatService] Stream read error:', readError);
                    break;
                }

                const { done, value } = result;
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                let boundaryIndex;
                while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
                    const eventBlock = buffer.slice(0, boundaryIndex);
                    buffer = buffer.slice(boundaryIndex + 2);

                    const payloadChunk = eventBlock.trim();
                    if (payloadChunk && onChunk) {
                        try {
                            onChunk(payloadChunk);
                        } catch (callbackError) {
                            console.warn('[ChatService] onChunk callback error:', callbackError);
                        }
                    }
                }
            }

            // Flush any remaining buffered data after stream ends
            if (buffer.trim() && onChunk) {
                onChunk(buffer.trim());
            }
        } finally {
            reader.releaseLock();
            console.debug('[ChatService] Streaming connection closed');
        }

        return response;
    },
};


export default streamService;