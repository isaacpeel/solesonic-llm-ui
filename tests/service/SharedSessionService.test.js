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
    },
}));

import sharedSessionService, {
    SESSION_ERROR_CODES,
    SessionStreamGoneError,
    describeSessionError,
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
});
