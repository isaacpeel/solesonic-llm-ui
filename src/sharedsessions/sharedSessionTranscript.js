import {AI, ERROR, SYSTEM, USER} from '../chat/message/ChatMessage.jsx';
import {
    CUSTOM,
    CUSTOM_IMAGE,
    CUSTOM_PROGRESS,
    RUN_ERROR,
    RUN_FINISHED,
    RUN_STARTED,
    TEXT_MESSAGE_CONTENT,
    TEXT_MESSAGE_START,
    extractGeneratedImages,
} from '../service/ChatService.js';
import {normalizeGeneratedImage} from '../service/ImageGenerationService.js';
import {appendProgressNotificationText, formatProgressNotificationText} from '../service/ProgressNotificationService.js';
import {SESSION_STATE_EVENT} from '../service/SharedSessionService.js';
import {commandsOfLastUserMessage, isAnalyzableCode} from '../util/analyzeRequest.js';
import {TOOL_ACTIVITY_EVENT, applyToolActivity, savedToolCalls, settledToolCalls} from '../chat/activity/toolActivity.js';

export const EMPTY_TRANSCRIPT = {messages: [], activeRun: null, session: null};

const runKey = (runId) => `run-${runId}`;

function parseData(frame) {
    if (typeof frame?.data !== 'string' || frame.data.length === 0) {
        return null;
    }

    try {
        return JSON.parse(frame.data);
    } catch {
        return null;
    }
}

function participantsOf(session) {
    return Array.isArray(session?.participants) ? session.participants : [];
}

export function participantNames(session) {
    const names = new Map();

    for (const participant of participantsOf(session)) {
        names.set(participant.userId, participant.name);
    }

    return names;
}

export function viewerParticipantName(session, viewerUserId) {
    return participantNames(session).get(viewerUserId) ?? null;
}

export function otherParticipantNames(session, viewerUserId) {
    return participantsOf(session)
        .filter((participant) => participant.userId !== viewerUserId)
        .map((participant) => participant.name ?? participant.username)
        .filter(Boolean);
}

export function isViewersTurn(session, viewerUserId) {
    return session?.status === 'ACTIVE'
        && Array.isArray(session?.turn?.userIds)
        && session.turn.userIds.includes(viewerUserId);
}

export function isPromptForViewer(session, viewerUserId) {
    return Array.isArray(session?.prompt?.forUserIds) && session.prompt.forUserIds.includes(viewerUserId);
}

export function waitingOn(session, viewerUserId) {
    const names = participantNames(session);

    return (Array.isArray(session?.turn?.userIds) ? session.turn.userIds : [])
        .filter((userId) => userId !== viewerUserId)
        .map((userId) => names.get(userId))
        .filter(Boolean);
}

export function transcriptFromMessages(chatMessages, session, viewerUserId) {
    const names = participantNames(session);
    const messages = [];
    let pendingNotifications = [];

    for (const chatMessage of Array.isArray(chatMessages) ? chatMessages : []) {
        if (typeof chatMessage.progressData?.code === 'string') {
            const failure = chatMessage.progressData;
            messages.push({
                _key: chatMessage.id,
                messageId: chatMessage.id,
                type: ERROR,
                text: failure.message || chatMessage.message || '',
                timestamp: chatMessage.timestamp,
                code: failure.code,
                occurredAt: typeof failure.occurredAt === 'string' ? failure.occurredAt : chatMessage.timestamp,
                analyzable: isAnalyzableCode(failure.code),
                failedCommands: commandsOfLastUserMessage(messages, USER),
            });
            pendingNotifications = [];
            continue;
        }

        if (chatMessage.progressData) {
            const notificationText = formatProgressNotificationText({
                ...chatMessage.progressData,
                message: chatMessage.progressData.message || chatMessage.message,
            });

            pendingNotifications = appendProgressNotificationText(pendingNotifications, notificationText);
            continue;
        }

        if (![USER, AI, SYSTEM].includes(chatMessage.messageType)) {
            continue;
        }

        if (chatMessage.messageType === USER) {
            pendingNotifications = [];
        }

        const message = {
            _key: chatMessage.id,
            messageId: chatMessage.id,
            type: chatMessage.messageType,
            text: chatMessage.message ?? '',
            timestamp: chatMessage.timestamp,
            senderName: chatMessage.messageType === USER ? names.get(chatMessage.senderUserId) ?? null : null,
            mine: chatMessage.messageType === USER && chatMessage.senderUserId === viewerUserId,
        };

        if (chatMessage.messageType === USER) {
            message.attachments = Array.isArray(chatMessage.attachments) ? chatMessage.attachments : [];
            message.commands = Array.isArray(chatMessage.commands) ? chatMessage.commands : [];
        }

        if (chatMessage.messageType === AI) {
            message.responseMetadata = chatMessage.responseMetadata ?? null;
            message.responseMetadataCalls = chatMessage.responseMetadataCalls ?? null;

            if (savedToolCalls(chatMessage.toolCalls)) {
                message.toolCalls = savedToolCalls(chatMessage.toolCalls);
            }

            message.generatedImages = Array.isArray(chatMessage.generatedImages)
                ? chatMessage.generatedImages.map((generatedImage) => normalizeGeneratedImage(generatedImage))
                : [];

            if (pendingNotifications.length > 0) {
                message.notifications = pendingNotifications;
                pendingNotifications = [];
            }
        }

        messages.push(message);
    }

    return {messages, activeRun: null, session};
}

function updateRunMessage(state, update) {
    if (!state.activeRun) {
        return state;
    }

    const key = runKey(state.activeRun.runId);

    return {
        ...state,
        messages: state.messages.map((message) => message._key === key ? update(message) : message),
    };
}

function withNewImages(existing, incoming) {
    const known = Array.isArray(existing) ? existing : [];
    const knownIds = new Set(known.map((image) => image.imageId));

    return [...known, ...incoming.filter((image) => !knownIds.has(image.imageId))];
}

function runStarted(state, data, viewerUserId) {
    const runId = data?.runId;

    if (!runId) {
        return state;
    }

    const userMessage = Array.isArray(data?.input?.messages) ? data.input.messages[0] : null;
    const messages = [...state.messages];
    const senderUserId = userMessage?.senderUserId
        ?? (userMessage?.name ? participantsOf(state.session).find((participant) => participant.name === userMessage.name)?.userId : null)
        ?? null;

    if (userMessage && !messages.some((message) => message.messageId === userMessage.id)) {
        messages.push({
            _key: userMessage.id ?? `user-${runId}`,
            messageId: userMessage.id,
            type: USER,
            text: userMessage.content ?? '',
            senderName: userMessage.name ?? null,
            mine: !!viewerUserId && senderUserId === viewerUserId,
            attachments: Array.isArray(userMessage.attachments) ? userMessage.attachments : [],
            commands: Array.isArray(userMessage.commands) ? userMessage.commands : [],
        });
    }

    if (!messages.some((message) => message._key === runKey(runId))) {
        messages.push({_key: runKey(runId), type: AI, text: '', isStreaming: true, notifications: []});
    }

    return {...state, messages, activeRun: {runId}};
}

function runFinished(state, data) {
    const finishedText = data?.result?.message?.message;
    const finishedType = data?.result?.message?.messageType;

    const finishedMessage = data?.result?.message;
    const finishedImages = extractGeneratedImages(finishedMessage);

    const finished = updateRunMessage(state, (message) => ({
        ...message,
        type: finishedType === SYSTEM ? SYSTEM : message.type,
        text: typeof finishedText === 'string' && finishedText.length > 0 ? finishedText : message.text,
        timestamp: finishedMessage?.timestamp ?? message.timestamp,
        responseMetadata: finishedMessage?.responseMetadata ?? message.responseMetadata ?? null,
        responseMetadataCalls: finishedMessage?.responseMetadataCalls ?? message.responseMetadataCalls ?? null,
        toolCalls: settledToolCalls(message.toolCalls, finishedMessage?.toolCalls),
        generatedImages: withNewImages(message.generatedImages, finishedImages),
        isStreaming: false,
    }));

    return {
        ...finished,
        messages: finished.messages.filter((message) => message.isStreaming
            || message.type !== AI
            || message.text
            || message.generatedImages?.length > 0),
        activeRun: null,
    };
}

export function applyFrame(state, frame, viewerUserId) {
    const data = parseData(frame);

    switch (frame?.event) {
        case RUN_STARTED:
            return runStarted(state, data, viewerUserId);

        case TEXT_MESSAGE_START:
            return data?.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
                ? updateRunMessage(state, (message) => ({...message, metadata: {...message.metadata, ...data.metadata}}))
                : state;

        case TEXT_MESSAGE_CONTENT:
            return typeof data?.delta === 'string'
                ? updateRunMessage(state, (message) => ({...message, text: message.text + data.delta}))
                : state;

        case CUSTOM:
            if (data?.name === SESSION_STATE_EVENT && data.value) {
                return {...state, session: data.value};
            }

            if (data?.name === CUSTOM_PROGRESS) {
                const notificationText = formatProgressNotificationText(data.value);

                return notificationText
                    ? updateRunMessage(state, (message) => ({
                        ...message,
                        notifications: appendProgressNotificationText(message.notifications, notificationText),
                    }))
                    : state;
            }

            if (data?.name === TOOL_ACTIVITY_EVENT) {
                return updateRunMessage(state, (message) => {
                    const toolCalls = applyToolActivity(message.toolCalls, data.value);
                    return toolCalls === message.toolCalls ? message : {...message, toolCalls};
                });
            }

            if (data?.name === CUSTOM_IMAGE) {
                const streamedImages = extractGeneratedImages(data.value);

                return streamedImages.length > 0
                    ? updateRunMessage(state, (message) => ({
                        ...message,
                        generatedImages: withNewImages(message.generatedImages, streamedImages),
                    }))
                    : state;
            }

            return state;

        case RUN_FINISHED:
            return runFinished(state, data);

        case RUN_ERROR: {
            const code = typeof data?.code === 'string' ? data.code : undefined;
            const failedCommands = commandsOfLastUserMessage(state.messages ?? [], USER);
            const failed = updateRunMessage(state, (message) => ({
                ...message,
                type: ERROR,
                text: data?.message || 'The agent could not answer that message. Please try again.',
                isStreaming: false,
                code,
                occurredAt: new Date().toISOString(),
                analyzable: isAnalyzableCode(code),
                failedCommands,
            }));

            return {...failed, activeRun: null};
        }

        default:
            return state;
    }
}
