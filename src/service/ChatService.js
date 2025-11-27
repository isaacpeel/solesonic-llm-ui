import axiosClient from "../client/AxiosClient.js"
import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";
import {fetchEventSource} from '@microsoft/fetch-event-source';

export const CHUNK = "chunk";
export const MESSAGE = "message";
export const DONE = "done";
export const ELICITATION = "elicitation";

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
        const {content} = JSON.parse(eventPayload.data);
        const event = eventPayload.event;

        switch (event) {
            case CHUNK:
            case MESSAGE:
                if (activeElicitation) {
                    setActiveElicitation(null);
                    setElicitationSubmitting(false);
                }

                appendToLastAIMessage(content);
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

        const {uri, method} = buildStreamingRequest(chatId, userId, config.streamingChatsUri);
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
                onopen(response) {
                    if (!response.ok) {
                        throw new Error(`Streaming failed: ${response.status} ${response.statusText}`);
                    }
                },
                onmessage(eventPayload) {
                    if (onChunk) {
                        onChunk(eventPayload);
                    }
                },
                onclose() {
                if (onDone) {
                    onDone();
                }
            },
                onerror(error) {
                    if (error?.name === 'AbortError') {
                        throw error;
                    }

                    if (error instanceof Error && error.message.startsWith('Streaming failed:')) {
                        throw error;
                    }

                    console.warn('[ChatService] Stream connection interrupted, attempting to reconnect...', error);
                }
            });
        } catch (error) {
            // This catch block is only reached if onerror throws.
            if (error?.name === 'AbortError') {
                throw error;
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
        ? {uri: `${baseUri}/${chatId}`, method: 'PUT'}
        : {uri: `${baseUri}/users/${userId}`, method: 'POST'};
}

function normalizePayload(input) {
    return typeof input === 'string'
        ? {chatMessage: input}
        : input;
}

export default chatService;
