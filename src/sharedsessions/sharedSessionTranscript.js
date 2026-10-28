import {AI, ERROR, SYSTEM, USER} from '../chat/message/ChatMessage.jsx';
import {CUSTOM, CUSTOM_PROGRESS, RUN_ERROR, RUN_FINISHED, RUN_STARTED, TEXT_MESSAGE_CONTENT} from '../service/ChatService.js';
import {SESSION_STATE_EVENT} from '../service/SharedSessionService.js';

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

    const messages = (Array.isArray(chatMessages) ? chatMessages : [])
        .filter((chatMessage) => !chatMessage.progressData)
        .filter((chatMessage) => [USER, AI, SYSTEM].includes(chatMessage.messageType))
        .map((chatMessage) => ({
            _key: chatMessage.id,
            messageId: chatMessage.id,
            type: chatMessage.messageType,
            text: chatMessage.message ?? '',
            timestamp: chatMessage.timestamp,
            senderName: chatMessage.messageType === USER ? names.get(chatMessage.senderUserId) ?? null : null,
            mine: chatMessage.messageType === USER && chatMessage.senderUserId === viewerUserId,
        }));

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

function runStarted(state, data, viewerUserId) {
    const runId = data?.runId;

    if (!runId) {
        return state;
    }

    const viewerName = viewerParticipantName(state.session, viewerUserId);
    const userMessage = Array.isArray(data?.input?.messages) ? data.input.messages[0] : null;
    const messages = [...state.messages];

    if (userMessage && !messages.some((message) => message.messageId === userMessage.id)) {
        messages.push({
            _key: userMessage.id ?? `user-${runId}`,
            messageId: userMessage.id,
            type: USER,
            text: userMessage.content ?? '',
            senderName: userMessage.name ?? null,
            mine: !!viewerName && userMessage.name === viewerName,
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

    const finished = updateRunMessage(state, (message) => ({
        ...message,
        type: finishedType === SYSTEM ? SYSTEM : message.type,
        text: typeof finishedText === 'string' && finishedText.length > 0 ? finishedText : message.text,
        isStreaming: false,
    }));

    return {
        ...finished,
        messages: finished.messages.filter((message) => message.isStreaming || message.type !== AI || message.text),
        activeRun: null,
    };
}

export function applyFrame(state, frame, viewerUserId) {
    const data = parseData(frame);

    switch (frame?.event) {
        case RUN_STARTED:
            return runStarted(state, data, viewerUserId);

        case TEXT_MESSAGE_CONTENT:
            return typeof data?.delta === 'string'
                ? updateRunMessage(state, (message) => ({...message, text: message.text + data.delta}))
                : state;

        case CUSTOM:
            if (data?.name === SESSION_STATE_EVENT && data.value) {
                return {...state, session: data.value};
            }

            if (data?.name === CUSTOM_PROGRESS && typeof data.value?.message === 'string') {
                return updateRunMessage(state, (message) => ({
                    ...message,
                    notifications: [...(message.notifications ?? []), data.value.message],
                }));
            }

            return state;

        case RUN_FINISHED:
            return runFinished(state, data);

        case RUN_ERROR: {
            const failed = updateRunMessage(state, (message) => ({
                ...message,
                type: ERROR,
                text: data?.message || 'The agent could not answer that message. Please try again.',
                isStreaming: false,
            }));

            return {...failed, activeRun: null};
        }

        default:
            return state;
    }
}
