import axiosClient from "../client/AxiosClient.js"
import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";
import {fetchEventSource} from '@microsoft/fetch-event-source';

export const CHUNK = "chunk";
export const MESSAGE = "message";
export const DONE = "done";
export const INIT = "init";
export const ELICITATION = "elicitation";

const chatService = {
    // Non-streaming chat (kept for backward compatibility)
    chat: async (userMessage, chatId) => {
        const accessToken = await authService.getAccessToken();
        const userId = await authService.getUserId();
        const options = axiosClient.setAuthHeader(accessToken);
        const chatBody = {chatMessage: userMessage};

        if (chatId) {
            const uri = `${config.chatsUri}/${chatId}/users/${userId}`;
            return await axiosClient.put(uri, chatBody, options);
        }

        // Start a new chat for the user
        const uri = `${config.chatsUri}/users/${userId}`;
        return await axiosClient.post(uri, chatBody, options);
    },

    handleFinalChunk: () => {
        console.log("Stream closed")
    },

    // Handle streaming chunks including SSE frames for chunk/done/elicitation
    handleStreamChunk: (eventPayload, {
        activeElicitation,
        chatId,
        appendToLastAIMessage,
        ensureChatIdFromResponse,
        finalizeLastAIMessage,
        setActiveElicitation,
        setElicitationSubmitting,
        setElicitationValues,
    }) => {
        const event = eventPayload.event;

        switch (event) {
            case INIT:
                try {
                    const initData = JSON.parse(eventPayload.data);
                    ensureChatIdFromResponse(initData);
                } catch (parseError) {
                    console.error('[ChatService] Failed to parse init payload:', parseError);
                }
                break;
            case CHUNK:
            case MESSAGE:
                try {
                    const {content} = JSON.parse(eventPayload.data);

                    if (activeElicitation) {
                        setActiveElicitation(null);
                        setElicitationSubmitting(false);
                    }

                    appendToLastAIMessage(content);
                } catch (parseError) {
                    console.error('[ChatService] Failed to parse chunk payload:', parseError);
                }
                break;
            case DONE:
                try {
                    const payloadData = JSON.parse(eventPayload.data);
                    ensureChatIdFromResponse(payloadData);
                    finalizeLastAIMessage(payloadData);
                } catch (parseError) {
                    console.error('[ChatService] Failed to parse done payload:', parseError);
                }

                setActiveElicitation(null);
                setElicitationSubmitting(false);
                break;
            case ELICITATION:
                try {
                    const elicitation = JSON.parse(eventPayload.data);

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
                break;
        }
    },

    // Streaming chat using fetchEventSource (SSE). This replaces manual ReadableStream parsing.
    async chatStream(userMessage, chatId, {onChunk, onDone, signal} = {}) {
        const token = await authService.getAccessToken();
        const userId = await authService.getUserId();
        let activeChatId = chatId;
        let streamDone = false;

        const {uri, method} = buildStreamingRequest(activeChatId, userId, config.streamingChatsUri);
        const body = JSON.stringify(normalizePayload(userMessage));

        try {
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
                    Accept: 'text/event-stream'
                },
                fetch: (_requestInput, init = {}) => {
                    const {uri: rebuiltUri, method: rebuiltMethod} = buildStreamingRequest(activeChatId, userId, config.streamingChatsUri);
                    return globalThis.fetch(rebuiltUri, {
                        ...init,
                        method: rebuiltMethod,
                    });
                },
                onopen(response) {
                    if (!response.ok) {
                        throw new Error(`Streaming failed: ${response.status} ${response.statusText}`);
                    }
                },
                onmessage(eventPayload) {

                    if (eventPayload.event === INIT || eventPayload.event === DONE) {
                        try {
                            const parsedPayload = JSON.parse(eventPayload.data);

                            if (parsedPayload?.id) {
                                activeChatId = parsedPayload.id;
                            }

                            if (eventPayload.event === DONE) {
                                streamDone = true;
                            }
                        } catch (parseError) {
                            console.warn('[ChatService] Failed to parse stream payload for chat id sync:', parseError);
                        }
                    }

                    if (onChunk) {
                        onChunk(eventPayload);
                    }
                },
                onclose() {
                    if (onDone) {
                        onDone();
                    }

                    if (streamDone) {
                        // Stream finished normally. Throw to stop fetchEventSource retry loop
                        // so the original request body is not sent again.
                        throw new Error('Stream closed');
                    }
                },
                onerror(error) {
                    if (error?.name === 'AbortError') {
                        throw error;
                    }

                    if (error instanceof Error && error.message.startsWith('Streaming failed:')) {
                        throw error;
                    }

                    // If the stream already completed, do not retry.
                    if (streamDone) {
                        throw error instanceof Error ? error : new Error(String(error));
                    }

                    if (activeChatId) {
                        console.warn('[ChatService] Stream interrupted, will reconnect to chat:', activeChatId);
                        return;
                    }

                    // No chatId yet — retry would POST and create a duplicate.
                    console.error('[ChatService] Stream failed before chat was created, not retrying.');
                    throw error instanceof Error ? error : new Error(String(error));
                }
            });
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw error;
            }
            // 'Stream closed' is thrown intentionally from onclose to stop the retry loop.
            if (error?.message === 'Stream closed') {
                return;
            }
            // If stream completed successfully but errored during teardown, swallow it.
            if (streamDone) {
                console.debug('[ChatService] Post-completion error (ignored):', error?.message);
                return;
            }
            console.error('[ChatService] Streaming connection failed:', error);
            throw new Error(`Streaming connection failed: ${error.message || String(error)}`);
        }
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

function buildStreamingRequest(chatId, userId, baseUri) {
    return chatId
        ? {uri: `${baseUri}/${chatId}/users/${userId}`, method: 'PUT'}
        : {uri: `${baseUri}/users/${userId}`, method: 'POST'};
}

function normalizePayload(input) {
    return typeof input === 'string'
        ? {chatMessage: input}
        : input;
}

export default chatService;
