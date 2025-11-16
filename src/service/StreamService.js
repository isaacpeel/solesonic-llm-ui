import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";
import { fetchEventSource } from '@microsoft/fetch-event-source';

const streamService = {
    chatStreamElicitationResponse: async (
        elicitationPayload,
        chatId,
        elicitationId,
        { onChunk, timeoutMs = 30000 } = {}
    ) => {
        const token = await authService.getAccessToken();

        const payload = (typeof elicitationPayload === 'string')
            ? { chatMessage: elicitationPayload }
            : elicitationPayload;

        const uri = `${config.streamingChatsUri}/${chatId}/${elicitationId}/elicitation-response`;
        const controller = new AbortController();
        const { signal } = controller;
        const method = 'POST';
        const body = JSON.stringify(payload);

        let timeoutId;
        try {
            timeoutId = setTimeout(() => {
                controller.abort();
                console.error(`[ChatService] Streaming request timed out after ${timeoutMs}ms`);
            }, timeoutMs);

            await fetchEventSource(uri, {
                method,
                body,
                signal,
                mode: 'cors',
                credentials: 'same-origin',
                openWhenHidden: true,
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    Accept: 'text/event-stream',
                },
                onopen(response) {
                    if (!response.ok) {
                        throw new Error(`Streaming request failed: ${response.status} ${response.statusText}`);
                    }
                },
                onmessage(ev) {
                    const eventType = ev?.event && ev.event.length > 0 ? ev.event : 'message';
                    const dataString = ev?.data ?? '';
                    const frameString = `event: ${eventType}\n` + `data: ${dataString}\n\n`;

                    if (onChunk) {
                        try {
                            onChunk(frameString);
                        } catch (callbackError) {
                            console.warn('[ChatService] onChunk callback error:', callbackError);
                        }
                    }
                },
                onerror(err) {
                    if (err?.name === 'AbortError') {
                        throw err;
                    }
                    console.error('[ChatService] SSE onerror (elicitation):', err);
                    throw err instanceof Error ? err : new Error(String(err));
                },
                onclose() {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    console.debug('[ChatService] Streaming connection closed (elicitation)');
                },
            });
        } catch (error) {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            if (error?.name === 'AbortError') {
                throw error;
            }

            console.error('[ChatService] Elicitation streaming error:', error);
            throw error instanceof Error ? error : new Error(String(error));
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    },
    handleStreamError(error, setError, setChatHistory, AI) {
        console.error('[StreamService] Streaming error:', error);
        setError(error);

        setChatHistory((previousHistory) => {
            const newHistory = [...previousHistory];
            const lastIndex = newHistory.length - 1;

            if (lastIndex >= 0 && newHistory[lastIndex].type === AI && !newHistory[lastIndex].text) {
                // If the AI placeholder was never filled, remove it
                newHistory.pop();
            } else if (lastIndex >= 0 && newHistory[lastIndex].type === AI) {
                // Otherwise, stop the streaming spinner
                newHistory[lastIndex] = { ...newHistory[lastIndex], isStreaming: false };
            }

            return newHistory;
        });
    }
};

export default streamService;