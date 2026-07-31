import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import useChatStream from '../../src/hooks/useChatStream.js';

vi.mock('../../src/service/AuthService.js', () => ({
    default: {},
}));

vi.mock('../../src/service/ChatService.js', () => ({
    default: {
        handleStreamChunk: vi.fn(),
        chatStream: vi.fn().mockResolvedValue(undefined),
    },
    /* useChatStream imports these constants directly; the mock must carry them. */
    CHUNK: 'chunk',
    MESSAGE: 'message',
    DONE: 'done',
    INIT: 'init',
    ELICITATION: 'elicitation',
    ERROR: 'error',
}));

vi.mock('../../src/service/StreamService.js', () => ({
    default: {
        handleStreamError: vi.fn(),
    },
}));

vi.mock('../../src/context/useSharedData.jsx', () => ({
    useSharedData: vi.fn(),
}));

import chatService from '../../src/service/ChatService.js';
import streamService from '../../src/service/StreamService.js';
import {useSharedData} from '../../src/context/useSharedData.jsx';

function makeAttachmentTray(overrides = {}) {
    return {
        hasPendingUploads: false,
        commitCaptions: vi.fn().mockResolvedValue([]),
        clearTray: vi.fn(),
        restoreTray: vi.fn(),
        ...overrides,
    };
}

function readyEntry(overrides = {}) {
    return {
        trayKey: 'tray-1',
        attachmentId: 'attachment-1',
        fileName: 'screenshot.png',
        contentType: 'image/png',
        fileSizeBytes: 1024,
        localObjectUrl: 'blob:local-1',
        uploadedCaption: '',
        captionCommitFailed: false,
        status: 'ready',
        ...overrides,
    };
}

describe('useChatStream', () => {
    let options;
    let setChatHistory;
    let chatInputRef;

    beforeEach(() => {
        setChatHistory = vi.fn();
        chatInputRef = {current: {style: {height: '20px'}, focus: vi.fn()}};
        useSharedData.mockReturnValue({chatInputRef});

        options = {
            chatId: null,
            chatHistory: [{type: 'ASSISTANT', text: 'welcome', _key: '1', ephemeral: true}],
            setChatHistory,
            appendToLastAIMessage: vi.fn(),
            appendNotificationToLastAIMessage: vi.fn(),
            updateSeededNotificationText: vi.fn(),
            stopStreamingLastAIMessage: vi.fn(),
            finalizeLastAIMessage: vi.fn(),
            ensureChatIdFromResponse: vi.fn(),
            activeElicitation: null,
            setActiveElicitation: vi.fn(),
            setElicitationSubmitting: vi.fn(),
            setElicitationValues: vi.fn(),
            getSelectedCommandRef: {current: null},
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('initial state', () => {
        const {result} = renderHook(() => useChatStream(options));

        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBe(null);
        expect(result.current.inputValue).toBe('');
    });

    it('handleInputChange', () => {
        const {result} = renderHook(() => useChatStream(options));

        act(() => {
            result.current.handleInputChange({target: {value: 'hello'}});
        });

        expect(result.current.inputValue).toBe('hello');
    });

    it('handleSubmit with empty input', async () => {
        const {result} = renderHook(() => useChatStream(options));

        await act(async () => {
            await result.current.handleSubmit();
        });

        expect(chatService.chatStream).not.toHaveBeenCalled();
        expect(setChatHistory).not.toHaveBeenCalled();
    });

    it('handleSubmit success flow', async () => {
        vi.useFakeTimers();
        const {result} = renderHook(() => useChatStream(options));

        act(() => {
            result.current.handleInputChange({target: {value: 'user question'}});
        });

        await act(async () => {
            await result.current.handleSubmit();
        });

        expect(setChatHistory).toHaveBeenCalledTimes(1);
        const nextHistory = setChatHistory.mock.calls[0][0];
        expect(nextHistory).toHaveLength(2);
        expect(nextHistory[0]).toMatchObject({type: 'USER', text: 'user question'});
        expect(nextHistory[1]).toMatchObject({type: 'ASSISTANT', text: '', isStreaming: true});
        expect(chatService.chatStream).toHaveBeenCalledTimes(1);
        expect(chatService.chatStream).toHaveBeenCalledWith(
            {chatMessage: 'user question'},
            options.chatId,
            expect.objectContaining({
                onChunk: expect.any(Function),
                signal: expect.any(AbortSignal),
            })
        );

        act(() => {
            vi.runAllTimers();
        });

        vi.useRealTimers();
    });

    it('handleSubmit abort', async () => {
        const abortError = new Error('aborted');
        abortError.name = 'AbortError';
        chatService.chatStream.mockRejectedValueOnce(abortError);

        const {result} = renderHook(() => useChatStream(options));

        act(() => {
            result.current.handleInputChange({target: {value: 'user question'}});
        });

        await act(async () => {
            await result.current.handleSubmit();
        });

        expect(streamService.handleStreamError).not.toHaveBeenCalled();
        expect(result.current.error).toBe(null);
    });

    it('handleSubmit error', async () => {
        chatService.chatStream.mockRejectedValueOnce(new Error('stream failed'));

        const {result} = renderHook(() => useChatStream(options));

        act(() => {
            result.current.handleInputChange({target: {value: 'user question'}});
        });

        await act(async () => {
            await result.current.handleSubmit();
        });

        expect(streamService.handleStreamError).toHaveBeenCalledTimes(1);
    });

    it('handleSubmit with commands', async () => {
        options.getSelectedCommandRef = {current: vi.fn(() => 'agile')};
        const {result} = renderHook(() => useChatStream(options));

        act(() => {
            result.current.handleInputChange({target: {value: '/agile show board'}});
        });

        await act(async () => {
            await result.current.handleSubmit();
        });

        expect(chatService.chatStream).toHaveBeenCalledWith(
            {chatMessage: '/agile show board', commands: ['agile']},
            options.chatId,
            expect.objectContaining({
                onChunk: expect.any(Function),
                signal: expect.any(AbortSignal),
            })
        );
    });

    it('handleSubmit without commands', async () => {
        options.getSelectedCommandRef = {current: vi.fn(() => null)};
        const {result} = renderHook(() => useChatStream(options));

        act(() => {
            result.current.handleInputChange({target: {value: 'hello'}});
        });

        await act(async () => {
            await result.current.handleSubmit();
        });

        const payload = chatService.chatStream.mock.calls[0][0];
        expect(payload).toEqual({chatMessage: 'hello'});
        expect(payload.commands).toBeUndefined();
    });

    it('handleStreamChunk', () => {
        const {result} = renderHook(() => useChatStream(options));
        const rawPayload = {event: 'chunk', data: '{"content":"hello"}'};

        act(() => {
            result.current.handleStreamChunk(rawPayload);
        });

        expect(chatService.handleStreamChunk).toHaveBeenCalledWith(rawPayload, {
            activeElicitation: options.activeElicitation,
            chatId: options.chatId,
            appendToLastAIMessage: options.appendToLastAIMessage,
            appendNotificationMessage: options.appendNotificationToLastAIMessage,
            ensureChatIdFromResponse: options.ensureChatIdFromResponse,
            finalizeLastAIMessage: options.finalizeLastAIMessage,
            setActiveElicitation: options.setActiveElicitation,
            setElicitationSubmitting: options.setElicitationSubmitting,
            setElicitationValues: options.setElicitationValues,
            setError: expect.any(Function),
            adoptMessageId: options.adoptMessageIdForLastUserMessage,
        });
    });
});

describe('useChatStream with attachments', () => {
    let options;
    let setChatHistory;
    let chatInputRef;

    function emitInit(chunkOptions) {
        chunkOptions.onChunk({event: 'init', data: '{"id":"chat-1"}'});
    }

    function emitDone(chunkOptions) {
        chunkOptions.onChunk({event: 'done', data: '{"id":"chat-1"}'});
    }

    beforeEach(() => {
        setChatHistory = vi.fn();
        chatInputRef = {current: {style: {height: '20px'}, focus: vi.fn()}};
        useSharedData.mockReturnValue({chatInputRef});

        options = {
            chatId: null,
            chatHistory: [],
            setChatHistory,
            appendToLastAIMessage: vi.fn(),
            appendNotificationToLastAIMessage: vi.fn(),
            updateSeededNotificationText: vi.fn(),
            stopStreamingLastAIMessage: vi.fn(),
            finalizeLastAIMessage: vi.fn(),
            ensureChatIdFromResponse: vi.fn(),
            adoptMessageIdForLastUserMessage: vi.fn(),
            activeElicitation: null,
            setActiveElicitation: vi.fn(),
            setElicitationSubmitting: vi.fn(),
            setElicitationValues: vi.fn(),
            getSelectedCommandRef: {current: null},
            attachmentTray: makeAttachmentTray(),
        };

        chatService.chatStream.mockImplementation(async (payload, chatId, chunkOptions) => {
            emitInit(chunkOptions);
            emitDone(chunkOptions);
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    async function submitWith(result, messageText) {
        act(() => {
            result.current.handleInputChange({target: {value: messageText}});
        });

        await act(async () => {
            await result.current.handleSubmit();
        });
    }

    it('sends attachmentIds and renders optimistic attachments on the USER message', async () => {
        options.attachmentTray = makeAttachmentTray({
            commitCaptions: vi.fn().mockResolvedValue([readyEntry({uploadedCaption: 'the error banner'})]),
        });

        const {result} = renderHook(() => useChatStream(options));
        await submitWith(result, 'what is wrong here');

        const payload = chatService.chatStream.mock.calls[0][0];
        expect(payload.attachmentIds).toEqual(['attachment-1']);

        const nextHistory = setChatHistory.mock.calls[0][0];
        expect(nextHistory[0].attachments).toEqual([{
            id: 'attachment-1',
            fileName: 'screenshot.png',
            description: 'the error banner',
            contentType: 'image/png',
            fileSizeBytes: 1024,
            localObjectUrl: 'blob:local-1',
        }]);
    });

    it('omits attachmentIds entirely when the tray is empty', async () => {
        const {result} = renderHook(() => useChatStream(options));
        await submitWith(result, 'plain message');

        const payload = chatService.chatStream.mock.calls[0][0];
        expect(payload).toEqual({chatMessage: 'plain message'});
        expect('attachmentIds' in payload).toBe(false);
    });

    it('blocks the send while an upload is still in flight', async () => {
        options.attachmentTray = makeAttachmentTray({hasPendingUploads: true});

        const {result} = renderHook(() => useChatStream(options));
        await submitWith(result, 'too early');

        expect(chatService.chatStream).not.toHaveBeenCalled();
        expect(options.attachmentTray.commitCaptions).not.toHaveBeenCalled();
    });

    it('clears the tray only after init arrives, never before the stream', async () => {
        const clearTray = vi.fn();
        options.attachmentTray = makeAttachmentTray({
            clearTray,
            commitCaptions: vi.fn().mockResolvedValue([readyEntry()]),
        });

        chatService.chatStream.mockImplementation(async (payload, chatId, chunkOptions) => {
            expect(clearTray).not.toHaveBeenCalled();
            emitInit(chunkOptions);
            emitDone(chunkOptions);
        });

        const {result} = renderHook(() => useChatStream(options));
        await submitWith(result, 'look at this');

        expect(clearTray).toHaveBeenCalledTimes(1);
        expect(options.attachmentTray.restoreTray).not.toHaveBeenCalled();
    });

    it('restores the tray and the typed text when the stream ends without init', async () => {
        const settledEntries = [readyEntry()];
        options.attachmentTray = makeAttachmentTray({
            commitCaptions: vi.fn().mockResolvedValue(settledEntries),
        });

        chatService.chatStream.mockResolvedValue(undefined);

        const {result} = renderHook(() => useChatStream(options));
        await submitWith(result, 'look at this');

        expect(options.attachmentTray.restoreTray).toHaveBeenCalledWith(settledEntries);
        expect(options.attachmentTray.clearTray).not.toHaveBeenCalled();
        expect(result.current.inputValue).toBe('look at this');
        expect(result.current.error).toBeInstanceOf(Error);

        const droppedHistory = setChatHistory.mock.calls[setChatHistory.mock.calls.length - 1][0];
        expect(droppedHistory).toEqual([]);
    });

    it('mentions the slash command in the failure copy when the send carried one', async () => {
        options.attachmentTray = makeAttachmentTray({
            commitCaptions: vi.fn().mockResolvedValue([readyEntry()]),
        });
        options.getSelectedCommandRef = {current: vi.fn(() => 'agile')};

        chatService.chatStream.mockResolvedValue(undefined);

        const {result} = renderHook(() => useChatStream(options));
        await submitWith(result, '/agile look at this');

        expect(result.current.error.message).toContain('re-select the command');
    });

    /* The continue-chat PUT path may legitimately never emit `init`; `done` is what matters. */
    it('does not treat a missing init as a failure when nothing was attached', async () => {
        chatService.chatStream.mockImplementation(async (payload, chatId, chunkOptions) => {
            emitDone(chunkOptions);
        });

        const {result} = renderHook(() => useChatStream(options));
        await submitWith(result, 'plain message');

        expect(options.attachmentTray.restoreTray).not.toHaveBeenCalled();
        expect(options.attachmentTray.clearTray).toHaveBeenCalledTimes(1);
        expect(result.current.error).toBeNull();
    });

    it('reports a stream that dies after init, without offering the spent ids for retry', async () => {
        options.attachmentTray = makeAttachmentTray({
            commitCaptions: vi.fn().mockResolvedValue([readyEntry()]),
        });

        chatService.chatStream.mockImplementation(async (payload, chatId, chunkOptions) => {
            emitInit(chunkOptions);
        });

        const {result} = renderHook(() => useChatStream(options));
        await submitWith(result, 'look at this');

        expect(result.current.error).toBeInstanceOf(Error);
        expect(result.current.error.message).toContain('stopped before it finished');
        expect(options.stopStreamingLastAIMessage).toHaveBeenCalledTimes(1);
        expect(options.attachmentTray.restoreTray).not.toHaveBeenCalled();
        expect(options.attachmentTray.clearTray).toHaveBeenCalledTimes(1);
    });

    /* The turn continues over the elicitation-response endpoint, so this leg ending is normal. */
    it('treats an elicitation frame as a legitimate end of the stream', async () => {
        chatService.chatStream.mockImplementation(async (payload, chatId, chunkOptions) => {
            emitInit(chunkOptions);
            chunkOptions.onChunk({event: 'elicitation', data: '{"elicitationId":"elicitation-1"}'});
        });

        const {result} = renderHook(() => useChatStream(options));
        await submitWith(result, 'plain message');

        expect(result.current.error).toBeNull();
        expect(options.stopStreamingLastAIMessage).not.toHaveBeenCalled();
    });

    it('escalates the seeded step to warm-up copy while the vision pass is silent', async () => {
        vi.useFakeTimers();

        options.attachmentTray = makeAttachmentTray({
            commitCaptions: vi.fn().mockResolvedValue([readyEntry()]),
        });

        chatService.chatStream.mockImplementation(async (payload, chatId, chunkOptions) => {
            vi.advanceTimersByTime(20000);
            emitInit(chunkOptions);
            emitDone(chunkOptions);
        });

        const {result} = renderHook(() => useChatStream(options));
        await submitWith(result, 'look at this');

        expect(options.updateSeededNotificationText).toHaveBeenCalledWith(
            expect.stringContaining('warming up')
        );

        vi.useRealTimers();
    });

    it('leaves no warm-up timer behind once the stream finishes', async () => {
        vi.useFakeTimers();

        options.attachmentTray = makeAttachmentTray({
            commitCaptions: vi.fn().mockResolvedValue([readyEntry()]),
        });

        const {result} = renderHook(() => useChatStream(options));
        await submitWith(result, 'look at this');

        act(() => {
            vi.advanceTimersByTime(60000);
        });

        expect(options.updateSeededNotificationText).not.toHaveBeenCalled();

        vi.useRealTimers();
    });

    it('still sends a lost-caption image and warns rather than erroring', async () => {
        options.attachmentTray = makeAttachmentTray({
            commitCaptions: vi.fn().mockResolvedValue([readyEntry({captionCommitFailed: true})]),
        });

        const {result} = renderHook(() => useChatStream(options));
        await submitWith(result, 'look at this');

        expect(chatService.chatStream.mock.calls[0][0].attachmentIds).toEqual(['attachment-1']);
        expect(result.current.error).toBeNull();
        expect(result.current.attachmentNotice).toContain('screenshot.png');
        expect(options.attachmentTray.clearTray).toHaveBeenCalledTimes(1);
    });

    it('seeds one vision step on the AI placeholder when attachments are sent', async () => {
        options.attachmentTray = makeAttachmentTray({
            commitCaptions: vi.fn().mockResolvedValue([
                readyEntry(),
                readyEntry({trayKey: 'tray-2', attachmentId: 'attachment-2', fileName: 'two.png'}),
            ]),
        });

        const {result} = renderHook(() => useChatStream(options));
        await submitWith(result, 'look at these');

        const aiPlaceholder = setChatHistory.mock.calls[0][0][1];
        expect(aiPlaceholder.notifications).toEqual(['Reading 2 images…']);
        expect(aiPlaceholder.hasSeededNotification).toBe(true);
    });

    it('uses the singular form for one image', async () => {
        options.attachmentTray = makeAttachmentTray({
            commitCaptions: vi.fn().mockResolvedValue([readyEntry()]),
        });

        const {result} = renderHook(() => useChatStream(options));
        await submitWith(result, 'look at this');

        expect(setChatHistory.mock.calls[0][0][1].notifications).toEqual(['Reading 1 image…']);
    });

    it('seeds nothing when no attachments were sent', async () => {
        const {result} = renderHook(() => useChatStream(options));
        await submitWith(result, 'plain message');

        const aiPlaceholder = setChatHistory.mock.calls[0][0][1];
        expect(aiPlaceholder.notifications).toEqual([]);
        expect(aiPlaceholder.hasSeededNotification).toBe(false);
    });

    it('drops entries whose upload never produced an id', async () => {
        options.attachmentTray = makeAttachmentTray({
            commitCaptions: vi.fn().mockResolvedValue([
                readyEntry(),
                readyEntry({trayKey: 'tray-2', attachmentId: null, fileName: 'failed.png'}),
            ]),
        });

        const {result} = renderHook(() => useChatStream(options));
        await submitWith(result, 'look at this');

        expect(chatService.chatStream.mock.calls[0][0].attachmentIds).toEqual(['attachment-1']);
        expect(setChatHistory.mock.calls[0][0][0].attachments).toHaveLength(1);
    });
});
