import apiClient from '../client/ApiClient.js';
import { parseSseStream } from '../client/parseSseStream.js';
import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";
import {getProgressNotificationTextFromRawData} from './ProgressNotificationService.js';

export const CHUNK = "chunk";
export const MESSAGE = "message";
export const DONE = "done";
export const INIT = "init";
export const ELICITATION = "elicitation";
export const ERROR = "error";

const chatService = {
    // Handle streaming chunks including SSE frames for chunk/done/elicitation
    handleStreamChunk: (eventPayload, {
        activeElicitation,
        chatId,
        appendToLastAIMessage,
        appendNotificationMessage,
        ensureChatIdFromResponse,
        finalizeLastAIMessage,
        setActiveElicitation,
        setElicitationSubmitting,
        setElicitationValues,
        setError,
        adoptMessageId,
    }) => {
        const progressNotificationText = getProgressNotificationTextFromRawData(eventPayload?.data);

        if (progressNotificationText) {
            appendNotificationMessage(progressNotificationText);
            return;
        }

        const event = eventPayload.event;

        switch (event) {
            case ERROR:
                try {
                    const errorData = JSON.parse(eventPayload.data);
                    const content = errorData?.content;

                    if (typeof content === 'string' && content.length > 0) {
                        setError(new Error(content));
                    }
                } catch (parseError) {
                    console.error('[ChatService] Failed to parse error payload:', parseError);
                }
                break;
            case INIT:
                try {
                    const initData = JSON.parse(eventPayload.data);
                    ensureChatIdFromResponse(initData);

                    /* Optional, so callers routing elicitation frames need not supply it. */
                    adoptMessageId?.(initData?.messageId);
                } catch (parseError) {
                    console.error('[ChatService] Failed to parse init payload:', parseError);
                }
                break;
            case CHUNK:
            case MESSAGE:
                try {
                    const parsedPayload = JSON.parse(eventPayload.data);
                    const content = parsedPayload?.content;

                    if (typeof content !== 'string' || content.length === 0) {
                        break;
                    }

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

    async chatStream(payload, chatId, { onChunk, signal } = {}) {
        const token = await authService.getAccessToken();
        const userId = await authService.getUserId();
        const { uri, method } = buildStreamingRequest(chatId, userId, config.streamingChatsUri);

        const requestHeaders = {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
        };

        if (token) {
            requestHeaders.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(uri, {
            method,
            body: JSON.stringify(normalizePayload(payload)),
            signal,
            headers: requestHeaders,
        });

        if (!response.ok) {
            throw new Error(`Streaming failed: ${response.status} ${response.statusText}`);
        }

        for await (const event of parseSseStream(response.body)) {
            onChunk?.(event);

            if (event.event === DONE || event.event === ERROR) {
                break;
            }
        }
    },

    findChatDetails: async (chatId) => {
        return await apiClient.get(`${config.chatsUri}/${chatId}`);
    },

    findChatHistory: async () => {
        const userId = await authService.getUserId();
        return await apiClient.get(`${config.chatsUri}/users/${userId}`);
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
