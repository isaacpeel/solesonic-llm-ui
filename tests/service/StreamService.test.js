import {describe, it, expect, vi, afterEach} from 'vitest';

vi.mock('@microsoft/fetch-event-source', () => ({
    fetchEventSource: vi.fn(),
}));

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

vi.mock('../../src/chat/ChatMessage.jsx', () => ({
    AI: 'AI',
}));

import {fetchEventSource} from '@microsoft/fetch-event-source';
import streamService from '../../src/service/StreamService.js';
import {AI} from '../../src/chat/ChatMessage.jsx';

afterEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// chatStreamElicitationResponse
// ---------------------------------------------------------------------------

describe('chatStreamElicitationResponse', () => {
    it('happy path — forwards SSE events to onChunk', async () => {
        const onChunk = vi.fn();

        fetchEventSource.mockImplementation(async (_uri, options) => {
            options.onopen({ok: true});
            options.onmessage({event: 'CHUNK', data: '{"content":"hi"}'});
            options.onclose();
        });

        await streamService.chatStreamElicitationResponse(
            {action: 'accept', chatId: 'c-1'},
            'c-1',
            'e-1',
            {onChunk},
        );

        expect(onChunk).toHaveBeenCalledWith({event: 'CHUNK', data: '{"content":"hi"}'});
    });

    it('builds the URI from streamingChatsUri, chatId, and elicitationId', async () => {
        fetchEventSource.mockImplementation(async (uri, options) => {
            options.onopen({ok: true});
            options.onclose();
        });

        await streamService.chatStreamElicitationResponse({}, 'chat-42', 'elicit-7', {});

        const capturedUri = fetchEventSource.mock.calls[0][0];
        expect(capturedUri).toBe(
            'https://api.example.com/stream/chat-42/elicit-7/elicitation-response',
        );
    });

    it('onopen non-OK response — rejects with streaming error', async () => {
        fetchEventSource.mockImplementation(async (_uri, options) => {
            options.onopen({ok: false, status: 503, statusText: 'Service Unavailable'});
        });

        await expect(
            streamService.chatStreamElicitationResponse({}, 'c-1', 'e-1', {}),
        ).rejects.toThrow('Streaming request failed');
    });

    it('AbortError from onerror is rethrown unchanged', async () => {
        const abortError = Object.assign(new Error('Aborted'), {name: 'AbortError'});

        fetchEventSource.mockImplementation(async (_uri, options) => {
            options.onerror(abortError);
        });

        await expect(
            streamService.chatStreamElicitationResponse({}, 'c-1', 'e-1', {}),
        ).rejects.toMatchObject({name: 'AbortError'});
    });

    it('other error from onerror is rethrown as Error', async () => {
        fetchEventSource.mockImplementation(async (_uri, options) => {
            options.onerror(new Error('network failure'));
        });

        await expect(
            streamService.chatStreamElicitationResponse({}, 'c-1', 'e-1', {}),
        ).rejects.toThrow('network failure');
    });

    it('uses POST method with JSON-serialized payload', async () => {
        fetchEventSource.mockImplementation(async (_uri, options) => {
            options.onopen({ok: true});
            options.onclose();
        });

        await streamService.chatStreamElicitationResponse(
            {action: 'accept', chatId: 'c-1'},
            'c-1',
            'e-1',
            {},
        );

        const capturedOptions = fetchEventSource.mock.calls[0][1];
        expect(capturedOptions.method).toBe('POST');
        expect(JSON.parse(capturedOptions.body)).toEqual({action: 'accept', chatId: 'c-1'});
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
