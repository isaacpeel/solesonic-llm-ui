import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import chatService, {CHUNK, DONE, ELICITATION, INIT, MESSAGE} from '../src/service/ChatService.js';
import axiosClient from '../src/client/AxiosClient.js';
import authClient from "../src/service/AuthService.js";

beforeEach(() => {
    vi.mock('../src/client/AxiosClient.js', () => ({
        default: {
            get: vi.fn().mockResolvedValue({chatDetails: {}}),
            post: vi.fn().mockResolvedValue({success: true}),
            put: vi.fn().mockResolvedValue({success: true}),
            setAuthHeader: vi.fn().mockReturnValue({ headers: { 'Authorization': 'Bearer mock-access-token' } }),
            buildUrl: vi.fn().mockImplementation(uri => uri)
        }
    }));

    authClient.getAccessToken = vi.fn(async () => 'mock-access-token');
    authClient.getUserId = vi.fn(async () => 'mock-user-id')
    authClient.initializeUser = vi.fn().mockResolvedValue({
        tokens: {accessToken: 'mock-access-token'},
        userSub: 'mock-user-id',
    });

    vi.mock('../src/properties/ApplicationProperties', () => ({
        default: {
            chatsUri: 'https://api.example.com/chat',
            streamingChatsUri: 'https://api.example.com/stream',
            apiBaseUri: 'https://api.example.com',
        },
    }));
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('chatClient', () => {
    it('should send a chat message to an existing chat successfully', async () => {
        const userMessage = 'Hello, world!';
        const chatId = '12345';

        const result = await chatService.chat(userMessage, chatId);

        expect(axiosClient.setAuthHeader).toHaveBeenCalledWith('mock-access-token');
        expect(axiosClient.put).toHaveBeenCalledWith(
            'https://api.example.com/chat/12345/users/mock-user-id',
            {chatMessage: userMessage},
            { headers: { 'Authorization': 'Bearer mock-access-token' } }
        );
        expect(result).toEqual({success: true});
    });

    it('should create a new chat when chatId is not provided', async () => {
        const userMessage = 'Hello, world!';

        const result = await chatService.chat(userMessage);

        expect(axiosClient.setAuthHeader).toHaveBeenCalledWith('mock-access-token');
        expect(axiosClient.post).toHaveBeenCalledWith(
            'https://api.example.com/chat/users/mock-user-id',
            {chatMessage: userMessage},
            { headers: { 'Authorization': 'Bearer mock-access-token' } }
        );
        expect(result).toEqual({success: true});
    });

    it('should retrieve chat details successfully', async () => {
        const chatId = '67890';

        const result = await chatService.findChatDetails(chatId);

        expect(axiosClient.setAuthHeader).toHaveBeenCalledWith('mock-access-token');
        expect(axiosClient.get).toHaveBeenCalledWith(
            'https://api.example.com/chat/67890',
            { headers: { 'Authorization': 'Bearer mock-access-token' } }
        );
        expect(result).toEqual({chatDetails: {}});
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

vi.mock('@microsoft/fetch-event-source', () => ({
    fetchEventSource: vi.fn(),
}));

import {fetchEventSource} from '@microsoft/fetch-event-source';

describe('chatStream', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authClient.getAccessToken = vi.fn(async () => 'mock-access-token');
        authClient.getUserId = vi.fn(async () => 'mock-user-id');
    });

    it('happy path — onmessage forwards events to onChunk and onclose calls onDone', async () => {
        const onChunk = vi.fn();
        const onDone = vi.fn();

        fetchEventSource.mockImplementation(async (_uri, options) => {
            options.onopen({ok: true});
            options.onmessage({event: CHUNK, data: JSON.stringify({content: 'hi'})});
            options.onmessage({event: DONE, data: JSON.stringify({id: 'chat-1'})});
            options.onclose();
        });

        await chatService.chatStream('hello', null, {onChunk, onDone});

        expect(onChunk).toHaveBeenCalledTimes(2);
        expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('onopen non-OK response — chatStream rethrows as streaming connection failed', async () => {
        fetchEventSource.mockImplementation(async (_uri, options) => {
            options.onopen({ok: false, status: 503, statusText: 'Service Unavailable'});
        });

        await expect(chatService.chatStream('hello', null, {})).rejects.toThrow('Streaming connection failed');
    });

    it('AbortError — propagates out of chatStream unchanged', async () => {
        const abortError = Object.assign(new Error('Aborted'), {name: 'AbortError'});

        fetchEventSource.mockImplementation(async (_uri, options) => {
            options.onerror(abortError);
        });

        await expect(chatService.chatStream('hello', null, {})).rejects.toMatchObject({name: 'AbortError'});
    });

    it('"Streaming failed:" error is rethrown wrapped in streaming connection failed', async () => {
        const streamingError = new Error('Streaming failed: 500 Internal Server Error');

        fetchEventSource.mockImplementation(async (_uri, options) => {
            options.onerror(streamingError);
        });

        await expect(chatService.chatStream('hello', null, {})).rejects.toThrow('Streaming connection failed');
    });

    it('stream closed normally after DONE — chatStream resolves without rethrowing', async () => {
        fetchEventSource.mockImplementation(async (_uri, options) => {
            options.onopen({ok: true});
            options.onmessage({event: DONE, data: JSON.stringify({id: 'chat-1'})});
            try {
                options.onclose();
            } catch (closeError) {
                throw closeError;
            }
        });

        await expect(chatService.chatStream('hello', null, {})).resolves.toBeUndefined();
    });

    it('onerror with existing activeChatId — returns undefined to allow retry', async () => {
        let errorHandlerReturn;

        fetchEventSource.mockImplementation(async (_uri, options) => {
            options.onopen({ok: true});
            options.onmessage({event: INIT, data: JSON.stringify({id: 'existing-chat'})});
            errorHandlerReturn = options.onerror(new Error('network blip'));
            options.onmessage({event: DONE, data: JSON.stringify({id: 'existing-chat'})});
            options.onclose();
        });

        await chatService.chatStream('hello', 'existing-chat', {});

        expect(errorHandlerReturn).toBeUndefined();
    });

    it('onerror before chat created — throws to prevent duplicate POST', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        fetchEventSource.mockImplementation(async (_uri, options) => {
            options.onerror(new Error('network error'));
        });

        await expect(chatService.chatStream('hello', null, {})).rejects.toThrow();
        consoleError.mockRestore();
    });

    it('activeChatId sync — after INIT event, reconnect fetch uses PUT', async () => {
        let capturedFetch;

        fetchEventSource.mockImplementation(async (_uri, options) => {
            capturedFetch = options.fetch;
            options.onopen({ok: true});
            options.onmessage({event: INIT, data: JSON.stringify({id: 'new-chat-from-init'})});
            options.onmessage({event: DONE, data: JSON.stringify({id: 'new-chat-from-init'})});
            options.onclose();
        });

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: true}));

        await chatService.chatStream('hello', null, {});

        await capturedFetch('unused-url', {headers: {}});

        const fetchCall = globalThis.fetch.mock.calls[0];
        expect(fetchCall[0]).toContain('new-chat-from-init');
        expect(fetchCall[1].method).toBe('PUT');

        vi.unstubAllGlobals();
    });
});

// ---------------------------------------------------------------------------
// buildStreamingRequest / normalizePayload (tested via chatStream)
// ---------------------------------------------------------------------------

describe('buildStreamingRequest and normalizePayload via chatStream', () => {
    beforeEach(() => {
        authClient.getAccessToken = vi.fn(async () => 'mock-access-token');
        authClient.getUserId = vi.fn(async () => 'mock-user-id');
    });

    it('null chatId → POST to streamingChatsUri/users/userId', async () => {
        let capturedUri;
        let capturedMethod;

        fetchEventSource.mockImplementation(async (uri, options) => {
            capturedUri = uri;
            capturedMethod = options.method;
            options.onopen({ok: true});
            options.onmessage({event: DONE, data: JSON.stringify({id: 'c1'})});
            options.onclose();
        });

        await chatService.chatStream('hello', null, {});

        expect(capturedUri).toBe('https://api.example.com/stream/users/mock-user-id');
        expect(capturedMethod).toBe('POST');
    });

    it('existing chatId → PUT to streamingChatsUri/chatId/users/userId', async () => {
        let capturedUri;
        let capturedMethod;

        fetchEventSource.mockImplementation(async (uri, options) => {
            capturedUri = uri;
            capturedMethod = options.method;
            options.onopen({ok: true});
            options.onmessage({event: DONE, data: JSON.stringify({id: 'existing'})});
            options.onclose();
        });

        await chatService.chatStream('hello', 'existing', {});

        expect(capturedUri).toBe('https://api.example.com/stream/existing/users/mock-user-id');
        expect(capturedMethod).toBe('PUT');
    });

    it('string message → body normalized to { chatMessage: string }', async () => {
        let capturedBody;

        fetchEventSource.mockImplementation(async (_uri, options) => {
            capturedBody = options.body;
            options.onopen({ok: true});
            options.onmessage({event: DONE, data: JSON.stringify({id: 'c1'})});
            options.onclose();
        });

        await chatService.chatStream('hello', null, {});

        expect(JSON.parse(capturedBody)).toEqual({chatMessage: 'hello'});
    });

    it('object message → body passed through unchanged', async () => {
        let capturedBody;
        const messageObject = {chatMessage: 'from object'};

        fetchEventSource.mockImplementation(async (_uri, options) => {
            capturedBody = options.body;
            options.onopen({ok: true});
            options.onmessage({event: DONE, data: JSON.stringify({id: 'c1'})});
            options.onclose();
        });

        await chatService.chatStream(messageObject, null, {});

        expect(JSON.parse(capturedBody)).toEqual({chatMessage: 'from object'});
    });
});
