import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import chatService, {
    ATTACHMENT,
    CHUNK,
    DONE,
    ELICITATION,
    ERROR,
    INIT,
    MESSAGE,
    RESUME_ALREADY_COMPLETE,
    RESUME_REJECTED,
    RESUME_STREAMED,
    RESUME_UNAVAILABLE,
} from '../src/service/ChatService.js';
import authClient from "../src/service/AuthService.js";

vi.mock('../src/client/ApiClient.js', () => ({
    default: {
        get: vi.fn().mockResolvedValue({chatDetails: {}}),
        post: vi.fn().mockResolvedValue({success: true}),
        put: vi.fn().mockResolvedValue({success: true}),
        delete: vi.fn().mockResolvedValue(null),
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

describe('renameChat', () => {
    it('puts the name to the chat name endpoint, with no userId in the path', async () => {
        apiClient.put.mockResolvedValue({id: '67890', name: 'Trip planning'});

        await chatService.renameChat('67890', 'Trip planning');

        expect(apiClient.put).toHaveBeenCalledWith(
            'https://api.example.com/chat/67890/name',
            {name: 'Trip planning'},
        );
    });

    it('returns the parsed chat unchanged', async () => {
        const renamedChat = {id: '67890', name: 'Trip planning', chatMessages: []};
        apiClient.put.mockResolvedValue(renamedChat);

        expect(await chatService.renameChat('67890', 'Trip planning')).toBe(renamedChat);
    });
});

describe('deleteChat', () => {
    it('deletes the chat by id and returns null for the 204', async () => {
        apiClient.delete.mockResolvedValue(null);

        const result = await chatService.deleteChat('67890');

        expect(apiClient.delete).toHaveBeenCalledWith('https://api.example.com/chat/67890');
        expect(result).toBeNull();
    });

    /* A repeat is a 404, not a 204 — the caller is the one that decides that is not a failure. */
    it('propagates the failure rather than swallowing it', async () => {
        apiClient.delete.mockRejectedValue(Object.assign(new Error('404'), {status: 404}));

        await expect(chatService.deleteChat('67890')).rejects.toMatchObject({status: 404});
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
        setError: vi.fn(),
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

describe('handleStreamChunk — ATTACHMENT', () => {
    it('forwards the parsed payload to updateAttachmentStatus', () => {
        const updateAttachmentStatus = vi.fn();
        const callbacks = makeCallbacks({updateAttachmentStatus});
        const attachmentPayload = {id: 'attachment-1', indexed: false, extractionReason: 'unsupported file type'};
        const payload = {event: ATTACHMENT, data: JSON.stringify(attachmentPayload)};

        chatService.handleStreamChunk(payload, callbacks);

        expect(updateAttachmentStatus).toHaveBeenCalledWith(attachmentPayload);
    });

    it('does not throw when no updateAttachmentStatus handler is supplied', () => {
        const callbacks = makeCallbacks();
        const payload = {event: ATTACHMENT, data: JSON.stringify({id: 'attachment-1', described: false})};

        expect(() => chatService.handleStreamChunk(payload, callbacks)).not.toThrow();
    });

    it('malformed JSON logs error and does not throw', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const updateAttachmentStatus = vi.fn();
        const callbacks = makeCallbacks({updateAttachmentStatus});
        const payload = {event: ATTACHMENT, data: 'not-json'};

        expect(() => chatService.handleStreamChunk(payload, callbacks)).not.toThrow();
        expect(updateAttachmentStatus).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalled();
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

describe('handleStreamChunk — ERROR', () => {
    it('valid content calls setError with an Error containing the message', () => {
        const callbacks = makeCallbacks();
        const payload = {event: ERROR, data: JSON.stringify({content: 'Something went wrong on the server'})};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.setError).toHaveBeenCalledOnce();
        const receivedError = callbacks.setError.mock.calls[0][0];
        expect(receivedError).toBeInstanceOf(Error);
        expect(receivedError.message).toBe('Something went wrong on the server');
    });

    it('does not call appendToLastAIMessage', () => {
        const callbacks = makeCallbacks();
        const payload = {event: ERROR, data: JSON.stringify({content: 'Oops'})};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.appendToLastAIMessage).not.toHaveBeenCalled();
    });

    it('empty content does not call setError', () => {
        const callbacks = makeCallbacks();
        const payload = {event: ERROR, data: JSON.stringify({content: ''})};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.setError).not.toHaveBeenCalled();
    });

    it('missing content does not call setError', () => {
        const callbacks = makeCallbacks();
        const payload = {event: ERROR, data: JSON.stringify({})};

        chatService.handleStreamChunk(payload, callbacks);

        expect(callbacks.setError).not.toHaveBeenCalled();
    });

    it('malformed JSON logs error and does not throw', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const callbacks = makeCallbacks();
        const payload = {event: ERROR, data: 'not-json'};

        expect(() => chatService.handleStreamChunk(payload, callbacks)).not.toThrow();
        expect(callbacks.setError).not.toHaveBeenCalled();
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

        expect(callbacks.appendNotificationMessage).toHaveBeenCalledWith('Step 1 done 33%');
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

    it('object message with attachmentIds → passed through unchanged', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([
            {event: DONE, data: JSON.stringify({id: 'c1'})},
        ]));

        await chatService.chatStream({chatMessage: 'look', attachmentIds: ['attachment-1', 'attachment-2']}, null, {});

        const capturedBody = vi.mocked(fetch).mock.calls[0][1].body;
        expect(JSON.parse(capturedBody)).toEqual({
            chatMessage: 'look',
            attachmentIds: ['attachment-1', 'attachment-2'],
        });
    });
});

describe('handleStreamChunk INIT messageId', () => {
    function makeHandlers(overrides = {}) {
        return {
            activeElicitation: null,
            chatId: null,
            appendToLastAIMessage: vi.fn(),
            appendNotificationMessage: vi.fn(),
            ensureChatIdFromResponse: vi.fn(),
            finalizeLastAIMessage: vi.fn(),
            setActiveElicitation: vi.fn(),
            setElicitationSubmitting: vi.fn(),
            setElicitationValues: vi.fn(),
            setError: vi.fn(),
            ...overrides,
        };
    }

    it('calls adoptMessageId with the messageId from the init frame', () => {
        const adoptMessageId = vi.fn();
        const handlers = makeHandlers({adoptMessageId});

        chatService.handleStreamChunk(
            {event: INIT, data: JSON.stringify({id: 'chat-1', messageId: 'msg-1'})},
            handlers
        );

        expect(handlers.ensureChatIdFromResponse).toHaveBeenCalledWith({id: 'chat-1', messageId: 'msg-1'});
        expect(adoptMessageId).toHaveBeenCalledWith('msg-1');
    });

    it('passes undefined to adoptMessageId when the init frame carries no messageId', () => {
        const adoptMessageId = vi.fn();

        chatService.handleStreamChunk(
            {event: INIT, data: JSON.stringify({id: 'chat-1'})},
            makeHandlers({adoptMessageId})
        );

        expect(adoptMessageId).toHaveBeenCalledWith(undefined);
    });

    it('does not throw when no adoptMessageId handler is supplied', () => {
        const handlers = makeHandlers();

        expect(() => chatService.handleStreamChunk(
            {event: INIT, data: JSON.stringify({id: 'chat-1', messageId: 'msg-1'})},
            handlers
        )).not.toThrow();

        expect(handlers.ensureChatIdFromResponse).toHaveBeenCalled();
    });

    it('accepts an init frame carrying chatId instead of id', () => {
        const handlers = makeHandlers();

        chatService.handleStreamChunk(
            {event: INIT, data: JSON.stringify({chatId: 'chat-1', messageId: 'msg-1'})},
            handlers
        );

        expect(handlers.ensureChatIdFromResponse).toHaveBeenCalledWith({chatId: 'chat-1', messageId: 'msg-1'});
    });
});

describe('error frame shapes', () => {
    function makeHandlers(overrides = {}) {
        return {
            appendNotificationMessage: vi.fn(),
            ensureChatIdFromResponse: vi.fn(),
            finalizeLastAIMessage: vi.fn(),
            appendToLastAIMessage: vi.fn(),
            setActiveElicitation: vi.fn(),
            setElicitationSubmitting: vi.fn(),
            setElicitationValues: vi.fn(),
            setError: vi.fn(),
            ...overrides,
        };
    }

    it('surfaces a chat error carrying content', () => {
        const handlers = makeHandlers();

        chatService.handleStreamChunk(
            {event: ERROR, data: JSON.stringify({content: 'the model refused'})},
            handlers
        );

        expect(handlers.setError).toHaveBeenCalledWith(expect.objectContaining({message: 'the model refused'}));
    });

    it('surfaces an image-generation failure carrying code and message', () => {
        const handlers = makeHandlers();

        chatService.handleStreamChunk(
            {event: ERROR, data: JSON.stringify({code: 'GENERATION_TIMEOUT', message: 'image generation timed out'})},
            handlers
        );

        expect(handlers.setError).toHaveBeenCalledWith(expect.objectContaining({message: 'image generation timed out'}));
    });

    it('prefers content when a frame somehow carries both', () => {
        const handlers = makeHandlers();

        chatService.handleStreamChunk(
            {event: ERROR, data: JSON.stringify({content: 'the real one', message: 'the other one'})},
            handlers
        );

        expect(handlers.setError).toHaveBeenCalledWith(expect.objectContaining({message: 'the real one'}));
    });

    it('stays quiet when neither field carries text', () => {
        const handlers = makeHandlers();

        chatService.handleStreamChunk(
            {event: ERROR, data: JSON.stringify({code: 'GENERATION_TIMEOUT'})},
            handlers
        );

        expect(handlers.setError).not.toHaveBeenCalled();
    });
});

describe('chatStreamResume', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function makeResponse(status, overrides = {}) {
        return {
            status,
            ok: status >= 200 && status < 300,
            statusText: `status ${status}`,
            body: {},
            ...overrides,
        };
    }

    it('requests the resume endpoint with the cursor as an opaque header', async () => {
        parseSseStream.mockImplementation(async function* () {
            yield {event: DONE, id: '1754062831270-0', data: '{}'};
        });
        fetch.mockResolvedValue(makeResponse(200));

        const outcome = await chatService.chatStreamResume('chat-1', '1754062831251-1', {onChunk: vi.fn()});

        expect(outcome).toBe(RESUME_STREAMED);

        const [requestedUri, requestInit] = fetch.mock.calls[0];
        expect(requestedUri).toBe('https://api.example.com/stream/chat-1/users/mock-user-id/stream');
        expect(requestInit.method).toBe('GET');
        expect(requestInit.headers['Last-Event-ID']).toBe('1754062831251-1');
        expect(requestInit.headers.Accept).toBe('text/event-stream');
        expect(requestInit.headers.Authorization).toBe('Bearer mock-access-token');
    });

    it('sends the from-the-beginning sentinel when there is no cursor', async () => {
        parseSseStream.mockImplementation(async function* () {
            yield {event: DONE, id: '1754062831270-0', data: '{}'};
        });
        fetch.mockResolvedValue(makeResponse(200));

        await chatService.chatStreamResume('chat-1', null, {onChunk: vi.fn()});

        expect(fetch.mock.calls[0][1].headers['Last-Event-ID']).toBe('0');
    });

    it('routes replayed frames through onChunk and stops at the terminal frame', async () => {
        parseSseStream.mockImplementation(async function* () {
            yield {event: CHUNK, id: '1754062831260-0', data: '{"content":"rest"}'};
            yield {event: DONE, id: '1754062831270-0', data: '{}'};
            yield {event: CHUNK, id: '1754062831280-0', data: '{"content":"never"}'};
        });
        fetch.mockResolvedValue(makeResponse(200));

        const onChunk = vi.fn();
        await chatService.chatStreamResume('chat-1', '1754062831251-1', {onChunk});

        expect(onChunk).toHaveBeenCalledTimes(2);
        expect(onChunk.mock.calls[1][0].event).toBe(DONE);
    });

    it('reports 204 as nothing left to replay', async () => {
        fetch.mockResolvedValue(makeResponse(204, {body: null}));

        await expect(chatService.chatStreamResume('chat-1', '1754062831251-1', {}))
            .resolves.toBe(RESUME_ALREADY_COMPLETE);
    });

    it('reports an aged-out buffer and an unknown chat as unavailable', async () => {
        fetch.mockResolvedValue(makeResponse(410, {body: null}));
        await expect(chatService.chatStreamResume('chat-1', 'x', {})).resolves.toBe(RESUME_UNAVAILABLE);

        fetch.mockResolvedValue(makeResponse(404, {body: null}));
        await expect(chatService.chatStreamResume('chat-1', 'x', {})).resolves.toBe(RESUME_UNAVAILABLE);
    });

    it('treats a rejected cursor as recoverable but logs it as a client bug', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetch.mockResolvedValue(makeResponse(400, {body: null}));

        await expect(chatService.chatStreamResume('chat-1', 'not-a-cursor', {}))
            .resolves.toBe(RESUME_UNAVAILABLE);

        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });

    it('reports a forbidden chat as rejected so recovery does not keep asking', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetch.mockResolvedValue(makeResponse(403, {body: null}));

        await expect(chatService.chatStreamResume('chat-1', 'x', {})).resolves.toBe(RESUME_REJECTED);

        consoleErrorSpy.mockRestore();
    });

    it('throws on an unexpected server failure', async () => {
        fetch.mockResolvedValue(makeResponse(500, {body: null}));

        await expect(chatService.chatStreamResume('chat-1', 'x', {})).rejects.toThrow('Stream resume failed');
    });
});
