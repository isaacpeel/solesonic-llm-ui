import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import chatService, {CHUNK, DONE, ELICITATION, INIT, MESSAGE} from '../src/service/ChatService.js';
import authClient from "../src/service/AuthService.js";

vi.mock('../src/client/ApiClient.js', () => ({
    default: {
        get: vi.fn().mockResolvedValue({chatDetails: {}}),
        post: vi.fn().mockResolvedValue({success: true}),
        put: vi.fn().mockResolvedValue({success: true}),
    },
}));

vi.mock('../src/properties/ApplicationProperties', () => ({
    default: {
        chatsUri: 'https://api.example.com/chat',
        streamingChatsUri: 'https://api.example.com/stream',
        apiBaseUri: 'https://api.example.com',
    },
}));

vi.mock('../src/client/parseSseStream.js', () => ({
    parseSseStream: vi.fn(),
}));

import apiClient from '../src/client/ApiClient.js';
import { parseSseStream } from '../src/client/parseSseStream.js';

beforeEach(() => {
    authClient.getAccessToken = vi.fn(async () => 'mock-access-token');
    authClient.getUserId = vi.fn(async () => 'mock-user-id');
});

afterEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// findChatDetails / findChatHistory
// ---------------------------------------------------------------------------

describe('findChatDetails', () => {
    it('calls apiClient.get with the chat URI and returns the result', async () => {
        apiClient.get.mockResolvedValue({chatMessages: []});

        const result = await chatService.findChatDetails('67890');

        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/chat/67890');
        expect(result).toEqual({chatMessages: []});
    });
});

// ---------------------------------------------------------------------------
// handleStreamChunk
// ---------------------------------------------------------------------------

function makeCallbacks(overrides = {}) {
    return {
        activeElicitation: null,
        chatId: 'chat-1',
        appendToLastAIMessage: vi.fn(),
        appendNotificationMessage: vi.fn(),
        ensureChatIdFromResponse: vi.fn(),
        finalizeLastAIMessage: vi.fn(),
        setActiveElicitation: vi.fn(),
        setElicitationSubmitting: vi.fn(),
        setElicitationValues: vi.fn(),
        ...overrides,
    };
}

describe('handleStreamChunk — INIT', () => {
    it('valid JSON with id calls ensureChatIdFromResponse', () => {
        const callbacks = makeCallbacks();
        const payload = {event: INIT, data: JSON.stringify({id: 'new-chat'})};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.ensureChatIdFromResponse).toHaveBeenCalledWith({id: 'new-chat'});
    });

    it('malformed JSON logs error and does not throw', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const callbacks = makeCallbacks();
        const payload = {event: INIT, data: 'not-json'};

        expect(() => chatService.handleStreamChunk(payload, callbacks)).not.toThrow();
        expect(callbacks.ensureChatIdFromResponse).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});

describe('handleStreamChunk — CHUNK / MESSAGE', () => {
    it('valid content calls appendToLastAIMessage', () => {
        const callbacks = makeCallbacks();
        const payload = {event: CHUNK, data: JSON.stringify({content: 'hello'})};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.appendToLastAIMessage).toHaveBeenCalledWith('hello');
    });

    it('MESSAGE event also calls appendToLastAIMessage', () => {
        const callbacks = makeCallbacks();
        const payload = {event: MESSAGE, data: JSON.stringify({content: 'world'})};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.appendToLastAIMessage).toHaveBeenCalledWith('world');
    });

    it('empty content breaks early without calling appendToLastAIMessage', () => {
        const callbacks = makeCallbacks();
        const payload = {event: CHUNK, data: JSON.stringify({content: ''})};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.appendToLastAIMessage).not.toHaveBeenCalled();
    });

    it('missing content breaks early without calling appendToLastAIMessage', () => {
        const callbacks = makeCallbacks();
        const payload = {event: CHUNK, data: JSON.stringify({})};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.appendToLastAIMessage).not.toHaveBeenCalled();
    });

    it('when activeElicitation is set, clears it before appending', () => {
        const callbacks = makeCallbacks({activeElicitation: {someField: true}});
        const payload = {event: CHUNK, data: JSON.stringify({content: 'text'})};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.setActiveElicitation).toHaveBeenCalledWith(null);
        expect(callbacks.setElicitationSubmitting).toHaveBeenCalledWith(false);
        expect(callbacks.appendToLastAIMessage).toHaveBeenCalledWith('text');
    });

    it('when activeElicitation is null, does not call setActiveElicitation', () => {
        const callbacks = makeCallbacks({activeElicitation: null});
        const payload = {event: CHUNK, data: JSON.stringify({content: 'text'})};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.setActiveElicitation).not.toHaveBeenCalled();
        expect(callbacks.appendToLastAIMessage).toHaveBeenCalledWith('text');
    });

    it('malformed JSON logs error and does not throw', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const callbacks = makeCallbacks();
        const payload = {event: CHUNK, data: 'not-json'};

        expect(() => chatService.handleStreamChunk(payload, callbacks)).not.toThrow();
        expect(callbacks.appendToLastAIMessage).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});

describe('handleStreamChunk — DONE', () => {
    it('valid JSON calls ensureChatIdFromResponse and finalizeLastAIMessage', () => {
        const callbacks = makeCallbacks();
        const doneData = {id: 'chat-1', message: {message: 'final text', model: 'gpt-4'}};
        const payload = {event: DONE, data: JSON.stringify(doneData)};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.ensureChatIdFromResponse).toHaveBeenCalledWith(doneData);
        expect(callbacks.finalizeLastAIMessage).toHaveBeenCalledWith(doneData);
    });

    it('always calls setActiveElicitation(null) and setElicitationSubmitting(false)', () => {
        const callbacks = makeCallbacks({activeElicitation: {someField: true}});
        const payload = {event: DONE, data: JSON.stringify({id: 'chat-1'})};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.setActiveElicitation).toHaveBeenCalledWith(null);
        expect(callbacks.setElicitationSubmitting).toHaveBeenCalledWith(false);
    });

    it('calls setActiveElicitation and setElicitationSubmitting even on parse error', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const callbacks = makeCallbacks();
        const payload = {event: DONE, data: 'not-json'};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.setActiveElicitation).toHaveBeenCalledWith(null);
        expect(callbacks.setElicitationSubmitting).toHaveBeenCalledWith(false);
        consoleError.mockRestore();
    });
});

describe('handleStreamChunk — ELICITATION', () => {
    it('calls setElicitationSubmitting(false) and setActiveElicitation with parsed object', () => {
        const callbacks = makeCallbacks();
        const elicitation = {requestedSchema: {properties: {name: {}, city: {}}}};
        const payload = {event: ELICITATION, data: JSON.stringify(elicitation)};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.setElicitationSubmitting).toHaveBeenCalledWith(false);
        expect(callbacks.setActiveElicitation).toHaveBeenCalledWith(elicitation);
    });

    it('populates setElicitationValues with empty strings for each property except chatId', () => {
        const callbacks = makeCallbacks({chatId: 'fallback-chat'});
        const elicitation = {requestedSchema: {properties: {name: {}, chatId: {}}}};
        const payload = {event: ELICITATION, data: JSON.stringify(elicitation)};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.setElicitationValues).toHaveBeenCalledWith({
            name: '',
            chatId: 'fallback-chat',
        });
    });

    it('chatId resolves from elicitation._meta.chatId first', () => {
        const callbacks = makeCallbacks({chatId: 'fallback-chat'});
        const elicitation = {
            _meta: {chatId: 'meta-chat-id'},
            chatId: 'top-level-chat-id',
            requestedSchema: {properties: {chatId: {}}},
        };
        const payload = {event: ELICITATION, data: JSON.stringify(elicitation)};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.setElicitationValues).toHaveBeenCalledWith({chatId: 'meta-chat-id'});
    });

    it('chatId falls back to elicitation.chatId when _meta.chatId is absent', () => {
        const callbacks = makeCallbacks({chatId: 'fallback-chat'});
        const elicitation = {
            chatId: 'top-level-chat-id',
            requestedSchema: {properties: {chatId: {}}},
        };
        const payload = {event: ELICITATION, data: JSON.stringify(elicitation)};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.setElicitationValues).toHaveBeenCalledWith({chatId: 'top-level-chat-id'});
    });

    it('malformed JSON logs error and does not throw', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const callbacks = makeCallbacks();
        const payload = {event: ELICITATION, data: 'not-json'};

        expect(() => chatService.handleStreamChunk(payload, callbacks)).not.toThrow();
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});

describe('handleStreamChunk — progress notification', () => {
    it('calls appendNotificationMessage and returns early when notification text is present', () => {
        const callbacks = makeCallbacks();
        const progressData = JSON.stringify({
            progressToken: 'token-1',
            message: 'Step 1 done',
            progress: 1,
            total: 3,
        });
        const payload = {data: progressData};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.appendNotificationMessage).toHaveBeenCalledWith('Step 1 done');
        expect(callbacks.appendToLastAIMessage).not.toHaveBeenCalled();
        expect(callbacks.finalizeLastAIMessage).not.toHaveBeenCalled();
    });

    it('does not short-circuit when progress notification returns undefined', () => {
        const callbacks = makeCallbacks();
        const payload = {event: DONE, data: JSON.stringify({id: 'chat-1'})};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.appendNotificationMessage).not.toHaveBeenCalled();
        expect(callbacks.finalizeLastAIMessage).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// chatStream
// ---------------------------------------------------------------------------

function makeSseAsyncGenerator(events) {
    return async function* () {
        for (const event of events) {
            yield event;
        }
    };
}

describe('chatStream', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
        authClient.getAccessToken = vi.fn(async () => 'mock-access-token');
        authClient.getUserId = vi.fn(async () => 'mock-user-id');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('happy path — chunks then done: onChunk called for each event, exits after done', async () => {
        const onChunk = vi.fn();
        const events = [
            {event: INIT, data: JSON.stringify({id: 'chat-1'})},
            {event: CHUNK, data: JSON.stringify({content: 'hi'})},
            {event: DONE, data: JSON.stringify({id: 'chat-1'})},
        ];

        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator(events));

        await chatService.chatStream('hello', null, {onChunk});

        expect(onChunk).toHaveBeenCalledTimes(3);
    });

    it('done event triggers break before stream body closes', async () => {
        const onChunk = vi.fn();
        const events = [
            {event: DONE, data: JSON.stringify({id: 'chat-1'})},
            {event: CHUNK, data: JSON.stringify({content: 'should not reach'})},
        ];

        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator(events));

        await chatService.chatStream('hello', null, {onChunk});

        expect(onChunk).toHaveBeenCalledTimes(1);
        expect(onChunk).toHaveBeenCalledWith(events[0]);
    });

    it('server error on open — throws streaming failed error', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

        await expect(chatService.chatStream('hello', null, {})).rejects.toThrow('Streaming failed: 500');
    });

    it('AbortError from fetch — propagates to caller', async () => {
        const abortError = Object.assign(new Error('Aborted'), {name: 'AbortError'});
        vi.mocked(fetch).mockRejectedValue(abortError);

        await expect(chatService.chatStream('hello', null, {})).rejects.toMatchObject({name: 'AbortError'});
    });

    it('INIT event sets chat ID and onChunk receives it', async () => {
        const onChunk = vi.fn();
        const initEvent = {event: INIT, data: JSON.stringify({id: 'abc'})};

        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([
            initEvent,
            {event: DONE, data: JSON.stringify({id: 'abc'})},
        ]));

        await chatService.chatStream('hello', null, {onChunk});

        expect(onChunk).toHaveBeenCalledWith(initEvent);
    });

    it('null chatId → POST to streamingChatsUri/users/userId', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([
            {event: DONE, data: JSON.stringify({id: 'c1'})},
        ]));

        await chatService.chatStream('hello', null, {});

        const [capturedUri, capturedInit] = vi.mocked(fetch).mock.calls[0];
        expect(capturedUri).toBe('https://api.example.com/stream/users/mock-user-id');
        expect(capturedInit.method).toBe('POST');
    });

    it('existing chatId → PUT to streamingChatsUri/chatId/users/userId', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([
            {event: DONE, data: JSON.stringify({id: 'existing'})},
        ]));

        await chatService.chatStream('hello', 'existing', {});

        const [capturedUri, capturedInit] = vi.mocked(fetch).mock.calls[0];
        expect(capturedUri).toBe('https://api.example.com/stream/existing/users/mock-user-id');
        expect(capturedInit.method).toBe('PUT');
    });

    it('string message → body normalized to { chatMessage: string }', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([
            {event: DONE, data: JSON.stringify({id: 'c1'})},
        ]));

        await chatService.chatStream('hello', null, {});

        const capturedBody = vi.mocked(fetch).mock.calls[0][1].body;
        expect(JSON.parse(capturedBody)).toEqual({chatMessage: 'hello'});
    });

    it('object message → body passed through unchanged', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([
            {event: DONE, data: JSON.stringify({id: 'c1'})},
        ]));

        await chatService.chatStream({chatMessage: 'from object'}, null, {});

        const capturedBody = vi.mocked(fetch).mock.calls[0][1].body;
        expect(JSON.parse(capturedBody)).toEqual({chatMessage: 'from object'});
    });
});
