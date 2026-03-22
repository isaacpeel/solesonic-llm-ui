import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import useChatStream from '../../src/hooks/useChatStream.js';

vi.mock('../../src/service/AuthService.js', () => ({
    default: {},
}));

vi.mock('../../src/service/ChatService.js', () => ({
    default: {
        handleStreamChunk: vi.fn(),
        handleFinalChunk: vi.fn(),
        chatStream: vi.fn().mockResolvedValue(undefined),
    },
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
                onDone: expect.any(Function),
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

    it('handleSubmit with command', async () => {
        options.getSelectedCommandRef = {current: vi.fn(() => 'agile')};
        const {result} = renderHook(() => useChatStream(options));

        act(() => {
            result.current.handleInputChange({target: {value: '/agile show board'}});
        });

        await act(async () => {
            await result.current.handleSubmit();
        });

        expect(chatService.chatStream).toHaveBeenCalledWith(
            {chatMessage: '/agile show board', command: 'agile'},
            options.chatId,
            expect.objectContaining({
                onChunk: expect.any(Function),
                onDone: expect.any(Function),
                signal: expect.any(AbortSignal),
            })
        );
    });

    it('handleSubmit without command', async () => {
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
        expect(payload.command).toBeUndefined();
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
            ensureChatIdFromResponse: options.ensureChatIdFromResponse,
            finalizeLastAIMessage: options.finalizeLastAIMessage,
            setActiveElicitation: options.setActiveElicitation,
            setElicitationSubmitting: options.setElicitationSubmitting,
            setElicitationValues: options.setElicitationValues,
        });
    });
});
