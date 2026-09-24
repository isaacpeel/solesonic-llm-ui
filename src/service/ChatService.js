import apiClient from '../client/ApiClient.js';
import { parseSseStream } from '../client/parseSseStream.js';
import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";
import {getProgressNotificationText} from './ProgressNotificationService.js';
import {normalizeGeneratedImage} from './ImageGenerationService.js';
import {SYSTEM as SYSTEM_MESSAGE_TYPE} from '../chat/message/ChatMessage.jsx';

export const RUN_STARTED = "RUN_STARTED";
export const RUN_FINISHED = "RUN_FINISHED";
export const RUN_ERROR = "RUN_ERROR";
export const TEXT_MESSAGE_START = "TEXT_MESSAGE_START";
export const TEXT_MESSAGE_CONTENT = "TEXT_MESSAGE_CONTENT";
export const TEXT_MESSAGE_END = "TEXT_MESSAGE_END";
export const TOOL_CALL_START = "TOOL_CALL_START";
export const TOOL_CALL_ARGS = "TOOL_CALL_ARGS";
export const TOOL_CALL_END = "TOOL_CALL_END";
export const CUSTOM = "CUSTOM";

export const CUSTOM_PROGRESS = "progress";
export const CUSTOM_ATTACHMENT = "attachment";
export const CUSTOM_IMAGE = "image";
export const CUSTOM_FAILURE = "failure";
export const CUSTOM_CANCEL = "cancel";

export const TERMINAL_RUN_EVENTS = [RUN_FINISHED, RUN_ERROR];

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

/* One drawer-height of rows plus enough slack that the sentinel starts below the fold. */
export const DEFAULT_CHAT_HISTORY_PAGE_SIZE = 20;

/**
 * Flattens a Spring Data `Page` of chats into the shape the history drawer pages through.
 *
 * `last` is what drives "stop asking for more", so it is derived rather than trusted blindly:
 * an omitted flag falls back to the page counters, and an empty page always terminates so a
 * miscounted total cannot turn into an endless fetch loop.
 */
export function normalizeChatHistoryPage(response, requestedPage = 0) {
    const chats = Array.isArray(response?.content) ? response.content : [];

    /*
     * Spring serializes the counters either at the root (`Page`) or nested under `page`
     * (`PagedModel`, what the backend actually returns). Both are read so the drawer sees real
     * totals instead of silently falling back to "stop once a page comes back empty".
     */
    const metadata = typeof response?.page === 'object' && response.page !== null ? response.page : response;

    const pageNumber = Number.isInteger(metadata?.number) ? metadata.number : requestedPage;
    const totalPages = Number.isInteger(metadata?.totalPages) ? metadata.totalPages : null;
    const totalElements = Number.isInteger(metadata?.totalElements) ? metadata.totalElements : null;

    let last;

    if (typeof response?.last === 'boolean') {
        last = response.last;
    } else if (totalPages !== null) {
        last = pageNumber + 1 >= totalPages;
    } else {
        last = chats.length === 0;
    }

    return {
        chats,
        page: pageNumber,
        last: last || chats.length === 0,
        totalPages,
        totalElements,
    };
}

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

/*
 * The persisted USER row is carried on RUN_STARTED as the run's input. Read from the end so a
 * run whose input also replays earlier turns still yields the message this turn persisted.
 */
export function findRunStartedUserMessageId(runStartedData) {
    const inputMessages = Array.isArray(runStartedData?.input?.messages) ? runStartedData.input.messages : [];

    for (let messageIndex = inputMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
        if (inputMessages[messageIndex]?.role === 'user') {
            return inputMessages[messageIndex].id ?? null;
        }
    }

    return null;
}

const ROUTED_EVENTS = new Set([RUN_STARTED, TEXT_MESSAGE_CONTENT, TOOL_CALL_ARGS, RUN_FINISHED, RUN_ERROR, CUSTOM]);

function surfaceErrorText(errorText, setError) {
    if (typeof errorText === 'string' && errorText.length > 0) {
        setError(new Error(errorText));
    }
}

/*
 * A failure carries the old error payload unchanged: chat errors put the text in `content`,
 * image-generation failures in `message` next to a `code`.
 */
function readFailureText(failureValue) {
    if (typeof failureValue === 'string') {
        return failureValue;
    }

    if (typeof failureValue?.content === 'string' && failureValue.content.length > 0) {
        return failureValue.content;
    }

    return failureValue?.message;
}

function handleRunStarted(runStartedData, {ensureChatIdFromResponse, adoptMessageId}) {
    ensureChatIdFromResponse({chatId: runStartedData?.threadId});
    adoptMessageId?.(findRunStartedUserMessageId(runStartedData));
}

function handleTextMessageContent(textMessageData, {
    activeElicitation,
    isCancelling,
    appendToLastAIMessage,
    setActiveElicitation,
    setElicitationSubmitting,
}) {
    const delta = textMessageData?.delta;

    if (typeof delta !== 'string' || delta.length === 0) {
        return;
    }

    /* Tokens racing the cancel signal are never persisted (docs/api.md), so they are not shown either. */
    if (isCancelling) {
        return;
    }

    if (activeElicitation) {
        setActiveElicitation(null);
        setElicitationSubmitting(false);
    }

    appendToLastAIMessage(delta);
}

function handleToolCallArgs(toolCallData, {chatId, setActiveElicitation, setElicitationSubmitting, setElicitationValues}) {
    let elicitation;

    try {
        elicitation = JSON.parse(toolCallData?.delta);
    } catch (parseError) {
        console.error('[ChatService] Failed to parse tool call arguments:', parseError);
        return;
    }

    /* The API names every elicitation's tool call after its elicitation id; any other tool call is not a form. */
    const isElicitation = typeof elicitation === 'object'
        && elicitation !== null
        && !!toolCallData?.toolCallId
        && elicitation.elicitationId === toolCallData.toolCallId;

    if (!isElicitation) {
        return;
    }

    setElicitationSubmitting(false);
    setActiveElicitation(elicitation);

    const properties = elicitation.requestedSchema?.properties || {};
    const initialValues = {};

    for (const propertyName of Object.keys(properties)) {
        if (propertyName === 'chatId') {
            initialValues[propertyName] = elicitation._meta?.chatId || elicitation.chatId || chatId || '';
        } else {
            initialValues[propertyName] = '';
        }
    }

    setElicitationValues(initialValues);
}

function handleRunFinished(runFinishedData, {
    ensureChatIdFromResponse,
    finalizeLastAIMessage,
    stopStreamingLastAIMessage,
    appendSystemMessage,
    attachGeneratedImages,
    setActiveElicitation,
    setElicitationSubmitting,
}) {
    if (runFinishedData) {
        const result = runFinishedData.result;
        ensureChatIdFromResponse(result);

        const finishedImages = extractGeneratedImages(result?.message ?? result);

        if (finishedImages.length > 0) {
            attachGeneratedImages?.(finishedImages);
        }

        /*
         * A cancelled turn persists a SYSTEM message ("Chat canceled.") rather than the partial
         * answer. Finalizing with it would overwrite everything already streamed onto the AI
         * bubble — stop the bubble as-is instead and append the notice next to it.
         */
        if (result?.message?.messageType === SYSTEM_MESSAGE_TYPE) {
            stopStreamingLastAIMessage?.();
            appendSystemMessage?.(result.message.message);
        } else {
            finalizeLastAIMessage(result);
        }
    } else {
        stopStreamingLastAIMessage?.();
    }

    setActiveElicitation(null);
    setElicitationSubmitting(false);
}

function handleRunError(runErrorData, {setError, stopStreamingLastAIMessage, setActiveElicitation, setElicitationSubmitting}) {
    surfaceErrorText(runErrorData?.message, setError);
    stopStreamingLastAIMessage?.();
    setActiveElicitation(null);
    setElicitationSubmitting(false);
}

function handleCustomEvent(customEventData, {appendNotificationMessage, attachGeneratedImages, updateAttachmentStatus, setError}) {
    const customValue = customEventData?.value;

    switch (customEventData?.name) {
        case CUSTOM_PROGRESS: {
            const progressNotificationText = getProgressNotificationText(customValue);

            if (progressNotificationText) {
                appendNotificationMessage(progressNotificationText);
            }

            break;
        }
        case CUSTOM_IMAGE: {
            const streamedImages = extractGeneratedImages(customValue);

            if (streamedImages.length > 0) {
                attachGeneratedImages?.(streamedImages);
            }

            break;
        }
        case CUSTOM_ATTACHMENT:
            updateAttachmentStatus?.(customValue);
            break;
        case CUSTOM_FAILURE:
            surfaceErrorText(readFailureText(customValue), setError);
            break;
    }
}

const chatService = {
    handleStreamChunk: (eventPayload, handlers) => {
        const event = eventPayload?.event;

        if (!ROUTED_EVENTS.has(event)) {
            return;
        }

        let eventData = null;

        try {
            eventData = JSON.parse(eventPayload.data);
        } catch (parseError) {
            console.error(`[ChatService] Failed to parse ${event} payload:`, parseError);
        }

        if (event === RUN_FINISHED) {
            handleRunFinished(eventData, handlers);
            return;
        }

        if (event === RUN_ERROR) {
            handleRunError(eventData, handlers);
            return;
        }

        if (!eventData) {
            return;
        }

        switch (event) {
            case RUN_STARTED:
                handleRunStarted(eventData, handlers);
                break;
            case TEXT_MESSAGE_CONTENT:
                handleTextMessageContent(eventData, handlers);
                break;
            case TOOL_CALL_ARGS:
                handleToolCallArgs(eventData, handlers);
                break;
            case CUSTOM:
                handleCustomEvent(eventData, handlers);
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

            if (TERMINAL_RUN_EVENTS.includes(event.event)) {
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
        const uri = `${config.streamingChatsUri}/${encodeURIComponent(chatId)}/users/${userId}/stream`;

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

        /* The turn finished and we already hold every frame, the terminal one included. */
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

            if (TERMINAL_RUN_EVENTS.includes(event.event)) {
                break;
            }
        }

        return RESUME_STREAMED;
    },

    findChatDetails: async (chatId) => {
        return await apiClient.get(`${config.chatsUri}/${encodeURIComponent(chatId)}`);
    },

    /*
     * Fire-and-forget: a 202 only means the signal was sent, not that the turn stopped. The real
     * outcome still arrives on the SSE stream the caller is already subscribed to, as a `cancel`
     * CUSTOM event followed by RUN_FINISHED carrying "Chat canceled.". A 204 means there was
     * nothing to cancel.
     */
    cancelStream: async (chatId) => {
        const userId = await authService.getUserId();

        return await apiClient.post(`${config.streamingChatsUri}/${encodeURIComponent(chatId)}/users/${userId}/cancel`);
    },

    /*
     * Renames a conversation. No userId in the path — ownership comes from the bearer token, so a
     * chat the caller does not own is a 404 and cannot be told apart from one that never existed.
     * The parsed chat is returned as-is; the caller decides what to merge.
     */
    renameChat: async (chatId, name) => {
        return await apiClient.put(`${config.chatsUri}/${chatId}/name`, {name});
    },

    /*
     * Deletes a conversation and everything under it — messages, their attachments, and the images
     * generated inside it — in one transaction. Irreversible: there is no trash and no undo. A
     * repeat is a 404 rather than a 204, so callers treat 404 as "already gone" instead of as a
     * failure.
     *
     * It does not cancel a turn that is already streaming; the caller must wait for RUN_FINISHED.
     */
    deleteChat: async (chatId) => {
        return await apiClient.delete(`${config.chatsUri}/${chatId}`);
    },

    /*
     * One page of the user's chats, newest first. The endpoint is a Spring `Pageable` one, so the
     * cursor is the page index — built with `URLSearchParams` rather than `buildUrl` so the service
     * stays callable without a `window`.
     */
    findChatHistory: async ({page = 0, size = DEFAULT_CHAT_HISTORY_PAGE_SIZE} = {}) => {
        const userId = await authService.getUserId();
        const queryString = new URLSearchParams({page: String(page), size: String(size)}).toString();
        const response = await apiClient.get(`${config.chatsUri}/users/${userId}?${queryString}`);

        return normalizeChatHistoryPage(response, page);
    },
}

/*
 * The chat id is percent-encoded because it can come straight from the `/chat/:chatId` route
 * param, which React Router hands over already decoded — an id carrying encoded dot segments
 * would otherwise be normalized by the URL parser into a request against a different endpoint,
 * with the caller's bearer token attached.
 */
function buildStreamingRequest(chatId, userId, baseUri) {
    return chatId
        ? {uri: `${baseUri}/${encodeURIComponent(chatId)}/users/${userId}`, method: 'PUT'}
        : {uri: `${baseUri}/users/${userId}`, method: 'POST'};
}

function normalizePayload(input) {
    return typeof input === 'string'
        ? {chatMessage: input}
        : input;
}

export default chatService;
