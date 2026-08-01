import apiClient from '../client/ApiClient.js';
import { parseSseStream } from '../client/parseSseStream.js';
import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";
import {getProgressNotificationTextFromRawData} from './ProgressNotificationService.js';
import {normalizeGeneratedImage} from './ImageGenerationService.js';

export const CHUNK = "chunk";
export const MESSAGE = "message";
export const DONE = "done";
export const INIT = "init";
export const ELICITATION = "elicitation";
export const ERROR = "error";
export const IMAGE = "image";

/* Outcomes of a resume attempt, mapped from the status codes the resume endpoint decides up front. */
export const RESUME_STREAMED = "streamed";
export const RESUME_ALREADY_COMPLETE = "alreadyComplete";
export const RESUME_UNAVAILABLE = "unavailable";
export const RESUME_REJECTED = "rejected";

/*
 * Replays the whole retained stream. The API documents `0` as the from-the-beginning sentinel and
 * never emits it as a frame id, so there is no ambiguity with a real cursor.
 */
const RESUME_FROM_BEGINNING = "0";

/**
 * Pulls generated-image references off a stream payload.
 *
 * Accepts a dedicated `image` frame carrying one reference, or a `generatedImages` array
 * hung off any payload — the two shapes the API could reasonably use to attach an image
 * out-of-band (plan §5 step 4). Anything without an id is dropped rather than rendered as
 * an empty frame.
 */
export function extractGeneratedImages(payload) {
    const candidates = Array.isArray(payload?.generatedImages)
        ? payload.generatedImages
        : (payload?.imageId || payload?.imageUrl) ? [payload] : [];

    return candidates
        .map((candidate) => normalizeGeneratedImage(candidate))
        .filter((generatedImage) => !!generatedImage.imageId);
}

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
        attachGeneratedImages,
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

                    /*
                     * Chat errors carry `content`; image-generation failures carry `code` plus
                     * `message`. Reading only `content` surfaced those as an empty error.
                     */
                    const content = typeof errorData?.content === 'string' && errorData.content.length > 0
                        ? errorData.content
                        : errorData?.message;

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

                    /* The reference can ride on `done` rather than its own frame. */
                    const doneImages = extractGeneratedImages(payloadData?.message ?? payloadData);

                    if (doneImages.length > 0) {
                        attachGeneratedImages?.(doneImages);
                    }

                    finalizeLastAIMessage(payloadData);
                } catch (parseError) {
                    console.error('[ChatService] Failed to parse done payload:', parseError);
                }

                setActiveElicitation(null);
                setElicitationSubmitting(false);
                break;
            case IMAGE:
                try {
                    const imagePayload = JSON.parse(eventPayload.data);
                    const streamedImages = extractGeneratedImages(imagePayload);

                    if (streamedImages.length > 0) {
                        attachGeneratedImages?.(streamedImages);
                    }
                } catch (parseError) {
                    console.error('[ChatService] Failed to parse image payload:', parseError);
                }
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

    /*
     * Picks a turn back up where a dropped connection left off. `lastEventId` is an opaque Redis
     * stream entry id (`<milliseconds>-<sequence>`) — it is stored and echoed verbatim, never
     * parsed. `parseInt` on one silently drops the sequence half, which would collapse two frames
     * emitted in the same millisecond onto one cursor and lose a frame on replay.
     */
    async chatStreamResume(chatId, lastEventId, { onChunk, signal } = {}) {
        const token = await authService.getAccessToken();
        const userId = await authService.getUserId();
        const uri = `${config.streamingChatsUri}/${chatId}/users/${userId}/stream`;

        const requestHeaders = {
            Accept: 'text/event-stream',
            'Last-Event-ID': lastEventId || RESUME_FROM_BEGINNING,
        };

        if (token) {
            requestHeaders.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(uri, {
            method: 'GET',
            signal,
            headers: requestHeaders,
        });

        /* The turn finished and we already hold every frame, `done` included. */
        if (response.status === 204) {
            return RESUME_ALREADY_COMPLETE;
        }

        /* Our cursor was not something the server ever sent — recoverable, but log it as our bug. */
        if (response.status === 400) {
            console.error('[ChatService] Stream resume rejected an invalid cursor:', lastEventId);
            return RESUME_UNAVAILABLE;
        }

        /* Not our chat. Reconciling against it would fail the same way. */
        if (response.status === 403) {
            console.error('[ChatService] Stream resume forbidden for chat:', chatId);
            return RESUME_REJECTED;
        }

        /* Buffer aged out, cursor trimmed away, or no such chat — reconcile from history instead. */
        if (response.status === 404 || response.status === 410) {
            return RESUME_UNAVAILABLE;
        }

        if (!response.ok) {
            throw new Error(`Stream resume failed: ${response.status} ${response.statusText}`);
        }

        for await (const event of parseSseStream(response.body)) {
            onChunk?.(event);

            if (event.event === DONE || event.event === ERROR) {
                break;
            }
        }

        return RESUME_STREAMED;
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
