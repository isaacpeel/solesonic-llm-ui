import apiClient, {ApiError, buildUrl, readApiErrorBody} from '../client/ApiClient.js';
import authService from './AuthService.js';
import config from '../properties/ApplicationProperties.jsx';
import {parseSseStream} from '../client/parseSseStream.js';

export const SESSION_STATE_EVENT = 'session_state';

export const SESSION_STATUSES = {
    ACTIVE: 'ACTIVE',
    COMPLETED: 'COMPLETED',
    CLOSED: 'CLOSED',
    EXPIRED: 'EXPIRED',
};

export const SESSION_MODES = {
    AGENT: 'AGENT',
    CONVERSATION: 'CONVERSATION',
};

export const INVITE_STATUSES = {
    PENDING: 'PENDING',
};

export const SESSION_ERROR_CODES = {
    PARTICIPANT_NOT_FOUND: 'PARTICIPANT_NOT_FOUND',
    INVALID_INVITE: 'INVALID_INVITE',
    INVITE_PENDING: 'INVITE_PENDING',
    TOO_MANY_INVITES: 'TOO_MANY_INVITES',
    INVITE_NOT_PENDING: 'INVITE_NOT_PENDING',
    AGENT_UNAVAILABLE: 'AGENT_UNAVAILABLE',
    SESSION_CLOSED: 'SESSION_CLOSED',
    RUN_IN_PROGRESS: 'RUN_IN_PROGRESS',
    NOT_YOUR_TURN: 'NOT_YOUR_TURN',
    MESSAGE_TOO_LONG: 'MESSAGE_TOO_LONG',
    TOO_MANY_PARTICIPANTS: 'TOO_MANY_PARTICIPANTS',
    NOT_SESSION_OWNER: 'NOT_SESSION_OWNER',
    CHAT_STREAMING: 'CHAT_STREAMING',
    COMMAND_NOT_ALLOWED: 'COMMAND_NOT_ALLOWED',
    SESSION_LIMIT_REACHED: 'SESSION_LIMIT_REACHED',
};

const ERROR_MESSAGES = {
    [SESSION_ERROR_CODES.PARTICIPANT_NOT_FOUND]: 'No one with that username.',
    [SESSION_ERROR_CODES.INVALID_INVITE]: 'That invite could not be sent.',
    [SESSION_ERROR_CODES.INVITE_PENDING]: 'There is already an invite waiting between you two.',
    [SESSION_ERROR_CODES.TOO_MANY_INVITES]: 'You have too many invites waiting for an answer.',
    [SESSION_ERROR_CODES.INVITE_NOT_PENDING]: 'That invite is no longer open.',
    [SESSION_ERROR_CODES.AGENT_UNAVAILABLE]: 'This is not available right now. Try again later.',
    [SESSION_ERROR_CODES.SESSION_CLOSED]: 'This session is over.',
    [SESSION_ERROR_CODES.RUN_IN_PROGRESS]: 'Still answering the last message.',
    [SESSION_ERROR_CODES.NOT_YOUR_TURN]: 'That question is for someone else.',
    [SESSION_ERROR_CODES.MESSAGE_TOO_LONG]: 'That message is too long.',
    [SESSION_ERROR_CODES.TOO_MANY_PARTICIPANTS]: 'That would be too many people in one chat.',
    [SESSION_ERROR_CODES.NOT_SESSION_OWNER]: 'Only the owner of this chat can do that.',
    [SESSION_ERROR_CODES.CHAT_STREAMING]: 'Wait for the response to finish, then try again.',
    [SESSION_ERROR_CODES.COMMAND_NOT_ALLOWED]: 'Commands are not available in shared chats.',
    [SESSION_ERROR_CODES.SESSION_LIMIT_REACHED]: 'You have too many active shared chats.',
};

/* The stream's cursor is older than anything it still holds: reload the transcript and read on from the end. */
export class SessionStreamGoneError extends Error {
    constructor() {
        super('The shared session stream no longer holds that cursor');
        this.name = 'SessionStreamGoneError';
    }
}

export function unknownUsernamesFrom(caughtError) {
    if (caughtError instanceof ApiError
        && caughtError.code === SESSION_ERROR_CODES.PARTICIPANT_NOT_FOUND
        && Array.isArray(caughtError.usernames)) {
        return caughtError.usernames;
    }

    return [];
}

export function describeSessionError(caughtError) {
    const unknownUsernames = unknownUsernamesFrom(caughtError);

    if (unknownUsernames.length > 0) {
        return `No one with the username ${unknownUsernames.join(', ')}.`;
    }

    if (caughtError instanceof ApiError && ERROR_MESSAGES[caughtError.code]) {
        return ERROR_MESSAGES[caughtError.code];
    }

    return 'Something went wrong. Please try again.';
}

const inviteUri = (inviteId) => `${config.sharedSessionInvitesUri}/${encodeURIComponent(inviteId)}`;
const sessionUri = (sessionId) => `${config.sharedSessionsUri}/${encodeURIComponent(sessionId)}`;

async function openStream(sessionId, {signal, lastEventId}) {
    const uri = lastEventId
        ? buildUrl(`${sessionUri(sessionId)}/stream`, {lastEventId})
        : `${sessionUri(sessionId)}/stream`;

    const send = async (token) => fetch(uri, {
        method: 'GET',
        signal,
        headers: token
            ? {Accept: 'text/event-stream', Authorization: `Bearer ${token}`}
            : {Accept: 'text/event-stream'},
    });

    let response = await send(await authService.getAccessToken());

    if (response.status === 401) {
        response = await send(await authService.getAccessToken());
    }

    if (response.status === 410) {
        throw new SessionStreamGoneError();
    }

    if (!response.ok) {
        const errorBody = await readApiErrorBody(response);

        throw new ApiError({
            message: `${response.status}: GET - ${uri} ${errorBody.message || response.statusText}`,
            status: response.status,
            method: 'GET',
            uri,
            code: errorBody.code,
            serverMessage: errorBody.message,
            usernames: errorBody.usernames,
        });
    }

    return response;
}

const sharedSessionService = {
    invite: async (username, agentName, openingMessage) => {
        return await apiClient.post(config.sharedSessionInvitesUri, {username, agentName, openingMessage});
    },

    shareConversation: async ({sourceChatId = null, usernames, name}) => {
        return await apiClient.post(config.sharedSessionsUri, {sourceChatId, usernames, name});
    },

    inviteToSession: async (sessionId, usernames) => {
        return await apiClient.post(`${sessionUri(sessionId)}/invites`, {usernames});
    },

    incomingInvites: async () => {
        return await apiClient.get(buildUrl(config.sharedSessionInvitesUri, {direction: 'incoming'})) ?? [];
    },

    outgoingInvites: async () => {
        return await apiClient.get(buildUrl(config.sharedSessionInvitesUri, {direction: 'outgoing'})) ?? [];
    },

    getInvite: async (inviteId) => {
        return await apiClient.get(inviteUri(inviteId));
    },

    acceptInvite: async (inviteId) => {
        return await apiClient.post(`${inviteUri(inviteId)}/accept`);
    },

    declineInvite: async (inviteId) => {
        return await apiClient.post(`${inviteUri(inviteId)}/decline`);
    },

    cancelInvite: async (inviteId) => {
        return await apiClient.delete(inviteUri(inviteId));
    },

    /* Without statuses, the sessions that still take messages: active ones, and completed ones that can start again. */
    sessions: async (statuses) => {
        const uri = Array.isArray(statuses) && statuses.length > 0
            ? buildUrl(config.sharedSessionsUri, {status: statuses.join(',')})
            : config.sharedSessionsUri;

        const page = await apiClient.get(uri);

        return Array.isArray(page?.content) ? page.content : [];
    },

    session: async (sessionId) => {
        return await apiClient.get(sessionUri(sessionId));
    },

    messages: async (sessionId) => {
        return await apiClient.get(`${sessionUri(sessionId)}/messages`) ?? [];
    },

    send: async (sessionId, text) => {
        return await apiClient.post(`${sessionUri(sessionId)}/messages`, {text});
    },

    answerPrompt: async (sessionId, elicitationId, action, content) => {
        return await apiClient.post(`${sessionUri(sessionId)}/messages`, {promptAnswer: {elicitationId, action, content}});
    },

    cancel: async (sessionId) => {
        return await apiClient.post(`${sessionUri(sessionId)}/cancel`);
    },

    leave: async (sessionId) => {
        return await apiClient.delete(sessionUri(sessionId));
    },

    /*
     * Every frame of every run, whoever started it. Without a cursor the server starts at the run in
     * progress, or at the end; a cursor it no longer holds is a SessionStreamGoneError.
     */
    watch: async function* (sessionId, {signal, lastEventId, onActivity} = {}) {
        const response = await openStream(sessionId, {signal, lastEventId});

        yield* parseSseStream(response.body, {onActivity});
    },
};

export default sharedSessionService;
