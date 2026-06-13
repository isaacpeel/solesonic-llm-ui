import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";
import { parseSseStream } from '../client/parseSseStream.js';
import {AI} from "../chat/ChatMessage.jsx"
import {DONE} from './ChatService.js';

const streamService = {
    chatStreamElicitationResponse: async (
        elicitationPayload,
        chatId,
        elicitationId,
        { onChunk, timeoutMs = 30000 } = {}
    ) => {
        const token = await authService.getAccessToken();
        const uri = `${config.streamingChatsUri}/${chatId}/${elicitationId}/elicitation-response`;

        const payload = typeof elicitationPayload === 'string'
            ? { chatMessage: elicitationPayload }
            : elicitationPayload;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(uri, {
                method: 'POST',
                body: JSON.stringify(payload),
                signal: controller.signal,
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    Accept: 'text/event-stream',
                },
            });

            if (!response.ok) {
                throw new Error(`Streaming failed: ${response.status} ${response.statusText}`);
            }

            for await (const event of parseSseStream(response.body)) {
                onChunk?.(event);

                if (event.event === DONE) {
                    break;
                }
            }
        } finally {
            clearTimeout(timeoutId);
        }
    },
    handleStreamError(error, setError, setChatHistory) {
        console.error('[StreamService] Streaming error:', error);
        setError(error);

        setChatHistory((previousHistory) => {
            const newHistory = [...previousHistory];
            const lastIndex = newHistory.length - 1;

            if (lastIndex >= 0 && newHistory[lastIndex].type === AI && !newHistory[lastIndex].text) {
                newHistory.pop();
            } else if (lastIndex >= 0 && newHistory[lastIndex].type === AI) {
                newHistory[lastIndex] = { ...newHistory[lastIndex], isStreaming: false };
            }

            return newHistory;
        });
    }
};

export default streamService;
