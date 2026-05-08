import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";
import { fetchEventSource } from '@microsoft/fetch-event-source';
import {AI} from "../chat/ChatMessage.jsx"

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
                openWhenHidden: false,
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
                onmessage(eventSourceMessage) {
                    const eventType = eventSourceMessage?.event && eventSourceMessage.event.length > 0 ? eventSourceMessage.event : 'message';
                    const dataString = eventSourceMessage?.data ?? '';

                    if (onChunk) {
                        try {
                            onChunk({ event: eventType, data: dataString });
                        } catch (callbackError) {
                            console.warn('[ChatService] onChunk callback error:', callbackError);
                        }
                    }
                },
                onerror(error) {
                    if (error?.name === 'AbortError') {
                        throw error;
                    }
                    console.error('[ChatService] SSE onerror (elicitation):', error);
                    throw error instanceof Error ? error : new Error(String(error));
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