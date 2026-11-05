import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('../../src/client/ApiClient.js', async (importOriginal) => ({
    ...await importOriginal(),
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getAccessToken: vi.fn(),
    },
}));

vi.mock('../../src/properties/ApplicationProperties.jsx', () => ({
    default: {
        sharedSessionsUri: 'https://api.example.com/shared-sessions',
        sharedSessionInvitesUri: 'https://api.example.com/shared-sessions/invites',
        userDirectoryUri: 'https://api.example.com/users/directory',
    },
}));

import sharedSessionService, {
    SESSION_ERROR_CODES,
    SessionStreamGoneError,
    SESSION_MODES,
    describeSessionError,
    unknownUsernamesFrom,
} from '../../src/service/SharedSessionService.js';
import apiClient, {ApiError} from '../../src/client/ApiClient.js';
import authService from '../../src/service/AuthService.js';

const SESSIONS_URI = 'https://api.example.com/shared-sessions';
const INVITES_URI = 'https://api.example.com/shared-sessions/invites';

function sseBody(text) {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
        },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    authService.getAccessToken.mockResolvedValue('token-1');
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('SharedSessionService', () => {
    it('sends an invite naming the agent and the message the session opens with', async () => {
        apiClient.post.mockResolvedValue({id: 'invite-1'});

        await sharedSessionService.invite('sam', 'feud', 'new show');

        expect(apiClient.post).toHaveBeenCalledWith(INVITES_URI, {username: 'sam', agentName: 'feud', openingMessage: 'new show'});
    });

    it('lists incoming and outgoing invites by direction', async () => {
        apiClient.get.mockResolvedValue(null);

        expect(await sharedSessionService.incomingInvites()).toEqual([]);
        await sharedSessionService.outgoingInvites();

        expect(apiClient.get.mock.calls[0][0]).toContain('direction=incoming');
        expect(apiClient.get.mock.calls[1][0]).toContain('direction=outgoing');
    });

    it('accepts, declines and cancels an invite at its own address', async () => {
        await sharedSessionService.acceptInvite('invite-1');
        await sharedSessionService.declineInvite('invite-1');
        await sharedSessionService.cancelInvite('invite-1');

        expect(apiClient.post).toHaveBeenCalledWith(`${INVITES_URI}/invite-1/accept`);
        expect(apiClient.post).toHaveBeenCalledWith(`${INVITES_URI}/invite-1/decline`);
        expect(apiClient.delete).toHaveBeenCalledWith(`${INVITES_URI}/invite-1`);
    });

    it('reads the sessions out of the page', async () => {
        apiClient.get.mockResolvedValue({content: [{id: 'session-1'}], totalElements: 1});

        expect(await sharedSessionService.sessions()).toEqual([{id: 'session-1'}]);
        expect(apiClient.get).toHaveBeenCalledWith(SESSIONS_URI);
    });

    it('sends a typed message and an answer to the same messages address', async () => {
        await sharedSessionService.send('session-1', 'towel');
        await sharedSessionService.answerPrompt('session-1', 'question-1', 'accept', {choice: 'play'});

        expect(apiClient.post).toHaveBeenCalledWith(`${SESSIONS_URI}/session-1/messages`, {text: 'towel'});
        expect(apiClient.post).toHaveBeenCalledWith(`${SESSIONS_URI}/session-1/messages`, {
            promptAnswer: {elicitationId: 'question-1', action: 'accept', content: {choice: 'play'}},
        });
    });

    it('leaves a session by deleting it', async () => {
        await sharedSessionService.leave('session-1');

        expect(apiClient.delete).toHaveBeenCalledWith(`${SESSIONS_URI}/session-1`);
    });

    it('watches the stream with the token and the cursor', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(sseBody('id: 5-0\nevent: RUN_STARTED\ndata: {}\n\n'), {status: 200}));
        vi.stubGlobal('fetch', fetchMock);

        const frames = [];
        for await (const frame of sharedSessionService.watch('session-1', {lastEventId: '4-0'})) {
            frames.push(frame);
        }

        expect(frames).toEqual([{event: 'RUN_STARTED', data: '{}', id: '5-0'}]);
        expect(fetchMock.mock.calls[0][0]).toContain('/shared-sessions/session-1/stream');
        expect(fetchMock.mock.calls[0][0]).toContain('lastEventId=4-0');
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token-1');
    });

    it('reports a cursor the stream no longer holds as gone', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 410})));

        await expect(async () => {
            for await (const frame of sharedSessionService.watch('session-1', {lastEventId: '1-0'})) {
                expect(frame).toBeUndefined();
            }
        }).rejects.toBeInstanceOf(SessionStreamGoneError);
    });

    it('retries the stream once with a fresh token after a 401', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(null, {status: 401}))
            .mockResolvedValueOnce(new Response(sseBody(''), {status: 200}));
        vi.stubGlobal('fetch', fetchMock);

        for await (const frame of sharedSessionService.watch('session-1')) {
            expect(frame).toBeUndefined();
        }

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('describes the errors a participant can act on', () => {
        const runInProgress = new ApiError({message: '409', status: 409, code: SESSION_ERROR_CODES.RUN_IN_PROGRESS});

        expect(describeSessionError(runInProgress)).toBe('Still answering the last message.');
        expect(describeSessionError(new Error('boom'))).toBe('Something went wrong. Please try again.');
    });

    it('shares a conversation with the chosen usernames', async () => {
        apiClient.post.mockResolvedValue({id: 'session-9'});

        const created = await sharedSessionService.shareConversation({sourceChatId: 'chat-1', usernames: ['alice', 'bob'], name: 'Trip'});

        expect(created).toEqual({id: 'session-9'});
        expect(apiClient.post).toHaveBeenCalledWith(SESSIONS_URI, {sourceChatId: 'chat-1', usernames: ['alice', 'bob'], name: 'Trip'});
    });

    it('sends a null source chat for a conversation that starts empty', async () => {
        await sharedSessionService.shareConversation({usernames: ['alice'], name: ''});

        expect(apiClient.post).toHaveBeenCalledWith(SESSIONS_URI, {sourceChatId: null, usernames: ['alice'], name: ''});
    });

    it('invites more people into an existing session', async () => {
        await sharedSessionService.inviteToSession('session-1', ['carol']);

        expect(apiClient.post).toHaveBeenCalledWith(`${SESSIONS_URI}/session-1/invites`, {usernames: ['carol']});
    });

    it('knows both session modes', () => {
        expect(SESSION_MODES).toEqual({AGENT: 'AGENT', CONVERSATION: 'CONVERSATION'});
    });

    it('describes each new error code', () => {
        const describeCode = (code) => describeSessionError(new ApiError({message: 'x', status: 409, code}));

        expect(describeCode(SESSION_ERROR_CODES.TOO_MANY_PARTICIPANTS)).toMatch(/too many people/i);
        expect(describeCode(SESSION_ERROR_CODES.NOT_SESSION_OWNER)).toMatch(/owner/i);
        expect(describeCode(SESSION_ERROR_CODES.CHAT_STREAMING)).toMatch(/finish/i);
        expect(describeCode(SESSION_ERROR_CODES.COMMAND_NOT_ALLOWED)).toMatch(/commands/i);
    });

    it('names the usernames that were not found, when the server lists them', () => {
        const withNames = new ApiError({message: 'x', status: 404, code: SESSION_ERROR_CODES.PARTICIPANT_NOT_FOUND, usernames: ['zed', 'yan']});
        const withoutNames = new ApiError({message: 'x', status: 404, code: SESSION_ERROR_CODES.PARTICIPANT_NOT_FOUND});
        const otherCode = new ApiError({message: 'x', status: 409, code: SESSION_ERROR_CODES.INVITE_PENDING, usernames: ['zed']});

        expect(unknownUsernamesFrom(withNames)).toEqual(['zed', 'yan']);
        expect(describeSessionError(withNames)).toBe('No one with the username zed, yan.');
        expect(unknownUsernamesFrom(withoutNames)).toEqual([]);
        expect(unknownUsernamesFrom(otherCode)).toEqual([]);
        expect(unknownUsernamesFrom(new Error('boom'))).toEqual([]);
    });

    it('describes the active-session limit', () => {
        const limit = new ApiError({message: 'x', status: 409, code: SESSION_ERROR_CODES.SESSION_LIMIT_REACHED});

        expect(SESSION_ERROR_CODES.SESSION_LIMIT_REACHED).toBe('SESSION_LIMIT_REACHED');
        expect(describeSessionError(limit)).toBe('You have too many active shared chats.');
    });

    it('shows the server message when the chat model is not available to the sender', () => {
        const withMessage = new ApiError({
            message: 'x',
            status: 409,
            code: SESSION_ERROR_CODES.MODEL_NOT_AVAILABLE,
            serverMessage: "This chat is set to openai/gpt-4o, which your account can't use. Pick another model for the chat and send again.",
        });
        const withoutMessage = new ApiError({message: 'x', status: 409, code: SESSION_ERROR_CODES.MODEL_NOT_AVAILABLE});

        expect(describeSessionError(withMessage)).toBe("This chat is set to openai/gpt-4o, which your account can't use. Pick another model for the chat and send again.");
        expect(describeSessionError(withoutMessage)).toBe("Your account can't use this chat's model. Pick another model and send again.");
    });

    it('sends attachment ids and commands with a conversation message', async () => {
        await sharedSessionService.send('session-1', '', {attachmentIds: ['att-1', 'att-2'], commands: ['web_search']});

        expect(apiClient.post).toHaveBeenCalledWith(`${SESSIONS_URI}/session-1/messages`, {
            text: '',
            attachmentIds: ['att-1', 'att-2'],
            commands: ['web_search'],
        });
    });

    it('always sends both lists when the caller supplies options, even empty ones', async () => {
        await sharedSessionService.send('session-1', 'hi', {attachmentIds: [], commands: []});

        expect(apiClient.post).toHaveBeenCalledWith(`${SESSIONS_URI}/session-1/messages`, {text: 'hi', attachmentIds: [], commands: []});
    });

    it('reads the shared command catalogue, narrowed by what has been typed', async () => {
        const commands = [{command: 'web_search', name: 'web_search'}];
        apiClient.get.mockResolvedValue({commands});

        expect(await sharedSessionService.commands('session-1', 'web')).toEqual(commands);
        expect(apiClient.get).toHaveBeenCalledWith(`${SESSIONS_URI}/session-1/commands?command=web`);

        await sharedSessionService.commands('session-1');
        expect(apiClient.get).toHaveBeenLastCalledWith(`${SESSIONS_URI}/session-1/commands`);
    });

    it('answers an empty catalogue when the commands cannot be read', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        apiClient.get.mockRejectedValue(new Error('down'));

        expect(await sharedSessionService.commands('session-1', 'web')).toEqual([]);
        vi.restoreAllMocks();
    });

    it('shows the server message that names a refused command', () => {
        const refused = new ApiError({
            message: 'x',
            status: 400,
            code: SESSION_ERROR_CODES.COMMAND_NOT_ALLOWED,
            serverMessage: 'The command /gmail is not allowed in shared chats.',
        });

        expect(describeSessionError(refused)).toBe('The command /gmail is not allowed in shared chats.');
    });
});
