import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getAccessToken: vi.fn().mockResolvedValue('mock-token'),
    },
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {
        streamingChatsUri: 'https://api.example.com/stream',
    },
}));

vi.mock('../../src/chat/message/ChatMessage.jsx', () => ({
    AI: 'AI',
}));

vi.mock('../../src/service/ChatService.js', () => ({
    TERMINAL_RUN_EVENTS: ['RUN_FINISHED', 'RUN_ERROR'],
}));

vi.mock('../../src/client/parseSseStream.js', () => ({
    parseSseStream: vi.fn(),
}));

import streamService from '../../src/service/StreamService.js';
import { parseSseStream } from '../../src/client/parseSseStream.js';
import {AI} from '../../src/chat/message/ChatMessage.jsx';

function makeSseAsyncGenerator(events) {
    return async function* () {
        for (const event of events) {
            yield event;
        }
    };
}

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// chatStreamElicitationResponse
// ---------------------------------------------------------------------------

describe('chatStreamElicitationResponse', () => {
    it('happy path — forwards SSE events to onChunk', async () => {
        const onChunk = vi.fn();

        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([
            {event: 'TEXT_MESSAGE_CONTENT', data: '{"delta":"hi"}'},
            {event: 'RUN_FINISHED', data: '{}'},
        ]));

        await streamService.chatStreamElicitationResponse(
            {action: 'accept', chatId: 'c-1'},
            'c-1',
            'e-1',
            {onChunk},
        );

        expect(onChunk).toHaveBeenCalledWith({event: 'TEXT_MESSAGE_CONTENT', data: '{"delta":"hi"}'});
    });

    it('builds the URI from streamingChatsUri, chatId, and elicitationId', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([{event: 'RUN_FINISHED', data: '{}'}]));

        await streamService.chatStreamElicitationResponse({}, 'chat-42', 'elicit-7', {});

        const capturedUri = vi.mocked(fetch).mock.calls[0][0];
        expect(capturedUri).toBe(
            'https://api.example.com/stream/chat-42/elicit-7/elicitation-response',
        );
    });

    it('percent-encodes the chat and elicitation ids in the path', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, body: null });

        await streamService.chatStreamElicitationResponse({}, '../chat', 'elicit/7', {});

        expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
            'https://api.example.com/stream/..%2Fchat/elicit%2F7/elicitation-response',
        );
    });

    it('non-OK response — rejects with streaming failed error', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });

        await expect(
            streamService.chatStreamElicitationResponse({}, 'c-1', 'e-1', {}),
        ).rejects.toThrow('Streaming failed');
    });

    it('AbortError from fetch is rethrown unchanged', async () => {
        const abortError = Object.assign(new Error('Aborted'), {name: 'AbortError'});
        vi.mocked(fetch).mockRejectedValue(abortError);

        await expect(
            streamService.chatStreamElicitationResponse({}, 'c-1', 'e-1', {}),
        ).rejects.toMatchObject({name: 'AbortError'});
    });

    it('uses POST method with JSON-serialized payload', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([{event: 'RUN_FINISHED', data: '{}'}]));

        await streamService.chatStreamElicitationResponse(
            {action: 'accept', chatId: 'c-1'},
            'c-1',
            'e-1',
            {},
        );

        const capturedInit = vi.mocked(fetch).mock.calls[0][1];
        expect(capturedInit.method).toBe('POST');
        expect(JSON.parse(capturedInit.body)).toEqual({action: 'accept', chatId: 'c-1'});
    });

    it('string payload is wrapped in chatMessage object', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([{event: 'RUN_FINISHED', data: '{}'}]));

        await streamService.chatStreamElicitationResponse('user text', 'c-1', 'e-1', {});

        const capturedBody = vi.mocked(fetch).mock.calls[0][1].body;
        expect(JSON.parse(capturedBody)).toEqual({chatMessage: 'user text'});
    });

    it('RUN_FINISHED breaks the loop', async () => {
        const onChunk = vi.fn();

        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([
            {event: 'RUN_FINISHED', data: '{}'},
            {event: 'TEXT_MESSAGE_CONTENT', data: 'should not reach'},
        ]));

        await streamService.chatStreamElicitationResponse({}, 'c-1', 'e-1', {onChunk});

        expect(onChunk).toHaveBeenCalledTimes(1);
    });

    it('RUN_ERROR breaks the loop', async () => {
        const onChunk = vi.fn();

        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([
            {event: 'RUN_ERROR', data: '{"message":"boom"}'},
            {event: 'TEXT_MESSAGE_CONTENT', data: 'should not reach'},
        ]));

        await streamService.chatStreamElicitationResponse({}, 'c-1', 'e-1', {onChunk});

        expect(onChunk).toHaveBeenCalledTimes(1);
    });

    it('a bodiless 200 is success — the turn continues on the stream already open', async () => {
        const onChunk = vi.fn();

        vi.mocked(fetch).mockResolvedValue({ ok: true, body: null });

        await expect(streamService.chatStreamElicitationResponse({}, 'c-1', 'e-1', {onChunk})).resolves.toBeUndefined();
        expect(parseSseStream).not.toHaveBeenCalled();
        expect(onChunk).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// handleStreamError
// ---------------------------------------------------------------------------

describe('handleStreamError', () => {
    it('calls setError with the error', () => {
        const setError = vi.fn();
        const setChatHistory = vi.fn();
        const error = new Error('stream failed');
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        streamService.handleStreamError(error, setError, setChatHistory);

        expect(setError).toHaveBeenCalledWith(error);
        consoleErrorSpy.mockRestore();
    });

    it('removes an empty streaming AI message from the end of history', () => {
        const setError = vi.fn();
        const setChatHistory = vi.fn();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        streamService.handleStreamError(new Error('fail'), setError, setChatHistory);

        const updater = setChatHistory.mock.calls[0][0];
        const history = [
            {type: 'USER', text: 'question', _key: 'u-1'},
            {type: AI, text: '', _key: 'ai-1', isStreaming: true},
        ];
        const result = updater(history);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('USER');
        consoleErrorSpy.mockRestore();
    });

    it('marks a non-empty streaming AI message as not streaming', () => {
        const setError = vi.fn();
        const setChatHistory = vi.fn();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        streamService.handleStreamError(new Error('fail'), setError, setChatHistory);

        const updater = setChatHistory.mock.calls[0][0];
        const history = [
            {type: AI, text: 'partial response', _key: 'ai-1', isStreaming: true},
        ];
        const result = updater(history);

        expect(result[0].isStreaming).toBe(false);
        expect(result[0].text).toBe('partial response');
        consoleErrorSpy.mockRestore();
    });

    it('leaves history unchanged when the last message is not AI', () => {
        const setError = vi.fn();
        const setChatHistory = vi.fn();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        streamService.handleStreamError(new Error('fail'), setError, setChatHistory);

        const updater = setChatHistory.mock.calls[0][0];
        const history = [{type: 'USER', text: 'question', _key: 'u-1'}];
        const result = updater(history);

        expect(result).toEqual(history);
        consoleErrorSpy.mockRestore();
    });

    it('leaves history unchanged when history is empty', () => {
        const setError = vi.fn();
        const setChatHistory = vi.fn();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        streamService.handleStreamError(new Error('fail'), setError, setChatHistory);

        const updater = setChatHistory.mock.calls[0][0];
        const result = updater([]);

        expect(result).toEqual([]);
        consoleErrorSpy.mockRestore();
    });
});

describe('isTransientStreamDisconnect', () => {
    it('recognizes the fetch teardown each engine throws', () => {
        expect(streamService.isTransientStreamDisconnect(new TypeError('Failed to fetch'))).toBe(true);
        expect(streamService.isTransientStreamDisconnect(new TypeError('Load failed'))).toBe(true);
        expect(streamService.isTransientStreamDisconnect(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true);
    });

    it('recognizes a connection failure reported as a plain Error', () => {
        expect(streamService.isTransientStreamDisconnect(new Error('The network connection was lost.'))).toBe(true);
        expect(streamService.isTransientStreamDisconnect(new Error('connection reset by peer'))).toBe(true);
    });

    it('is false for our own abort', () => {
        const abortError = new Error('aborted');
        abortError.name = 'AbortError';

        expect(streamService.isTransientStreamDisconnect(abortError)).toBe(false);
    });

    it('is false for a server-side failure', () => {
        expect(streamService.isTransientStreamDisconnect(new Error('Streaming failed: 500 Internal Server Error'))).toBe(false);
    });

    it('is false for nothing at all', () => {
        expect(streamService.isTransientStreamDisconnect(null)).toBe(false);
        expect(streamService.isTransientStreamDisconnect(undefined)).toBe(false);
    });
});
