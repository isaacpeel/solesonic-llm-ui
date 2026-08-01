import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";
import { parseSseStream } from '../client/parseSseStream.js';
import {AI} from "../chat/message/ChatMessage.jsx"
import {DONE, ERROR} from './ChatService.js';

/*
 * What a torn-down connection looks like across engines: Chrome throws `TypeError: Failed to
 * fetch`, Safari `TypeError: Load failed`, Firefox `TypeError: NetworkError…`. The message text
 * is not stable enough to match on alone, so the type carries most of the weight and the
 * pattern only catches the stragglers.
 */
const TRANSIENT_DISCONNECT_MESSAGE_PATTERN =
    /failed to fetch|load failed|network ?error|network connection|connection (lost|closed|reset|aborted)/i;

const streamService = {
    /*
     * True when a stream ended because the transport died rather than because the request was
     * bad. Never true for an abort — that is our own cancellation and has its own path.
     */
    isTransientStreamDisconnect: (error) => {
        if (!error || error.name === 'AbortError') {
            return false;
        }

        if (error.name === 'TypeError') {
            return true;
        }

        return TRANSIENT_DISCONNECT_MESSAGE_PATTERN.test(error.message || '');
    },

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
            const requestHeaders = {
                'Content-Type': 'application/json',
                Accept: 'text/event-stream',
            };

            if (token) {
                requestHeaders.Authorization = `Bearer ${token}`;
            }

            const response = await fetch(uri, {
                method: 'POST',
                body: JSON.stringify(payload),
                signal: controller.signal,
                headers: requestHeaders,
            });

            if (!response.ok) {
                throw new Error(`Streaming failed: ${response.status} ${response.statusText}`);
            }

            /*
             * The API reports this endpoint as `application/json` with no body — the turn
             * continues over the stream that is already open, not over this response. A bodiless
             * response is therefore success, not failure, and must not reach parseSseStream,
             * which throws on a null body. Frames are still handled if any ever arrive.
             */
            if (!response.body) {
                return;
            }

            for await (const event of parseSseStream(response.body)) {
                onChunk?.(event);

                if (event.event === DONE || event.event === ERROR) {
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
