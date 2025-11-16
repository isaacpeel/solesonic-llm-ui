import axiosClient from "../client/AxiosClient.js"
import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";
import {parseSSELines} from "./SeeService.js";
import { fetchEventSource } from '@microsoft/fetch-event-source';

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

    // Handle streaming chunks including SSE frames for chunk/done/elicitation
    handleStreamChunk: (raw, {
        activeElicitation,
        chatId,
        appendToLastAIMessage,
        ensureChatIdFromResponse,
        finalizeLastAIMessage,
        setActiveElicitation,
        setElicitationSubmitting,
        setElicitationValues,
    }) => {
        const frames = parseSSELines(raw);

        if (frames.length === 0) {

            if (activeElicitation) {
                setActiveElicitation(null);
                setElicitationSubmitting(false);
            }

            appendToLastAIMessage(String(raw));
            return;
        }

        for (const {event, data} of frames) {
            console.log("Event: ", event);
            if (event === 'chunk' || event === 'message') {

                if (activeElicitation) {
                    setActiveElicitation(null);
                    setElicitationSubmitting(false);
                }

                appendToLastAIMessage(data);
            } else if (event === 'done') {
                try {
                    const parsed = JSON.parse(data);
                    ensureChatIdFromResponse(parsed);
                    finalizeLastAIMessage(parsed);
                } catch (parseError) {
                    console.error('[ChatService] Failed to parse done payload:', parseError);
                }

                setActiveElicitation(null);
                setElicitationSubmitting(false);
            } else if (event === 'elicitation') {
                try {
                    const elicitation = JSON.parse(data);

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
            }
        }
    },

    // Streaming chat using fetchEventSource (SSE). This replaces manual ReadableStream parsing.
    async chatStream(userMessage, chatId, {onChunk, onDone, signal} = {}) {
        const token = await authService.getAccessToken();
        const userId = await authService.getUserId();

        const {uri, method} = buildStreamingRequest(chatId, userId, config.streamingChatsUri);
        const body = JSON.stringify(normalizePayload(userMessage));

        // Note: fetchEventSource handles SSE framing. We adapt each message back into an
        // "event: <type>\ndata: <payload>\n\n" string so existing handleStreamChunk + parseSSELines keep working.
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
                onmessage(ev) {
                    const eventType = ev?.event && ev.event.length > 0 ? ev.event : 'message';
                    const dataString = ev?.data ?? '';
                    const frameString = `event: ${eventType}\n` + `data: ${dataString}\n\n`;

                    if (onChunk) {
                        onChunk(frameString);
                    }
                },
                onerror(err) {
                    // Allow AbortError to bubble so UI does not treat it as error
                    if (err?.name === 'AbortError') {
                        throw err;
                    }
                    console.error('[ChatService] SSE onerror:', err);
                    throw err instanceof Error ? err : new Error(String(err));
                },
                onclose() {
                    if (onDone) {
                        onDone();
                    }
                }
            });
        } catch (err) {
            // Preserve abort semantics
            if (err?.name === 'AbortError') {
                throw err;
            }
            console.error('[ChatService] Streaming connection failed:', err);
            throw new Error(`Streaming connection failed: ${err.message || String(err)}`);
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

// Removed manual ReadableStream parsing utilities. fetchEventSource now provides
// message callbacks, and we adapt them into SSE-like frames for existing logic.

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

// (Intentionally left blank after refactor)


export default chatService;
