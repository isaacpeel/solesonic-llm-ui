import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act, waitFor} from '@testing-library/react';
import useStreamRecovery, {hasCompletedAssistantReply} from '../../src/hooks/useStreamRecovery.js';

vi.mock('../../src/service/AuthService.js', () => ({
    default: {},
}));

vi.mock('../../src/service/ChatService.js', () => ({
    default: {
        findChatDetails: vi.fn(),
        chatStreamResume: vi.fn(),
    },
    DONE: 'done',
    ERROR: 'error',
    RESUME_STREAMED: 'streamed',
    RESUME_ALREADY_COMPLETE: 'alreadyComplete',
    RESUME_UNAVAILABLE: 'unavailable',
    RESUME_REJECTED: 'rejected',
}));

vi.mock('../../src/util/pageLifecycle.js', () => ({
    isPageHidden: vi.fn().mockReturnValue(false),
    observePageHidden: vi.fn().mockReturnValue(() => {}),
    observePageResumed: vi.fn().mockReturnValue(() => {}),
}));

import chatService from '../../src/service/ChatService.js';
import {isPageHidden, observePageResumed} from '../../src/util/pageLifecycle.js';

function chatWithReply() {
    return {
        chatMessages: [
            {id: 'user-1', messageType: 'USER', message: 'question'},
            {id: 'ai-1', messageType: 'ASSISTANT', message: 'answer'},
        ],
    };
}

function chatWithoutReply() {
    return {
        chatMessages: [
            {id: 'user-1', messageType: 'USER', message: 'question'},
        ],
    };
}

describe('hasCompletedAssistantReply', () => {
    it('is true for an assistant reply after the anchored user message', () => {
        expect(hasCompletedAssistantReply(chatWithReply(), 'user-1')).toBe(true);
    });

    it('is false when the turn is still generating', () => {
        expect(hasCompletedAssistantReply(chatWithoutReply(), 'user-1')).toBe(false);
    });

    it('ignores an assistant reply that precedes this turn', () => {
        const chatDetails = {
            chatMessages: [
                {id: 'user-0', messageType: 'USER', message: 'earlier question'},
                {id: 'ai-0', messageType: 'ASSISTANT', message: 'earlier answer'},
                {id: 'user-1', messageType: 'USER', message: 'question'},
            ],
        };

        expect(hasCompletedAssistantReply(chatDetails, 'user-1')).toBe(false);
    });

    it('falls back to the last user message when no id was adopted', () => {
        expect(hasCompletedAssistantReply(chatWithReply(), null)).toBe(true);
        expect(hasCompletedAssistantReply(chatWithoutReply(), null)).toBe(false);
    });

    it('does not count a progress row as the reply', () => {
        const chatDetails = {
            chatMessages: [
                {id: 'user-1', messageType: 'USER', message: 'question'},
                {id: 'progress-1', messageType: 'ASSISTANT', message: 'Reading image', progressData: {message: 'Reading image'}},
            ],
        };

        expect(hasCompletedAssistantReply(chatDetails, 'user-1')).toBe(false);
    });

    it('does not count an empty reply', () => {
        const chatDetails = {
            chatMessages: [
                {id: 'user-1', messageType: 'USER', message: 'question'},
                {id: 'ai-1', messageType: 'ASSISTANT', message: '   '},
            ],
        };

        expect(hasCompletedAssistantReply(chatDetails, 'user-1')).toBe(false);
    });

    it('is false for an empty or malformed response', () => {
        expect(hasCompletedAssistantReply(null, 'user-1')).toBe(false);
        expect(hasCompletedAssistantReply({chatMessages: []}, 'user-1')).toBe(false);
    });
});

describe('useStreamRecovery', () => {
    let options;

    beforeEach(() => {
        isPageHidden.mockReturnValue(false);
        observePageResumed.mockImplementation(() => () => {});
        chatService.findChatDetails.mockResolvedValue(chatWithReply());

        /* Default to no resume attempt; the resume suite opts in per test. */
        chatService.chatStreamResume.mockResolvedValue('unavailable');

        options = {
            reloadChatHistory: vi.fn().mockResolvedValue(undefined),
            stopStreamingLastAIMessage: vi.fn(),
            markLastAIMessageReconnecting: vi.fn(),
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('refuses to start without a chat id', () => {
        const {result} = renderHook(() => useStreamRecovery(options));

        let started = null;

        act(() => {
            started = result.current.beginRecovery({recoveryChatId: null, userMessageId: 'user-1'});
        });

        expect(started).toBe(false);
        expect(options.markLastAIMessageReconnecting).not.toHaveBeenCalled();
    });

    it('reconciles the bubble once the reply is persisted', async () => {
        const {result} = renderHook(() => useStreamRecovery(options));

        act(() => {
            result.current.beginRecovery({recoveryChatId: 'chat-1', userMessageId: 'user-1'});
        });

        expect(options.markLastAIMessageReconnecting).toHaveBeenCalledWith(true);

        await waitFor(() => {
            expect(options.reloadChatHistory).toHaveBeenCalled();
        });

        expect(chatService.findChatDetails).toHaveBeenCalledWith('chat-1');
        expect(options.stopStreamingLastAIMessage).toHaveBeenCalled();

        await waitFor(() => {
            expect(result.current.recovering).toBe(false);
        });

        expect(result.current.recoveryFailed).toBe(false);
    });

    it('waits for the page to come back before polling', async () => {
        isPageHidden.mockReturnValue(true);

        let notifyPageResumed = null;
        observePageResumed.mockImplementation((callback) => {
            notifyPageResumed = callback;

            return () => {};
        });

        const {result} = renderHook(() => useStreamRecovery(options));

        act(() => {
            result.current.beginRecovery({recoveryChatId: 'chat-1', userMessageId: 'user-1'});
        });

        expect(chatService.findChatDetails).not.toHaveBeenCalled();

        await act(async () => {
            notifyPageResumed();
        });

        await waitFor(() => {
            expect(chatService.findChatDetails).toHaveBeenCalledWith('chat-1');
        });
    });

    it('keeps polling while the reply is not there yet', async () => {
        chatService.findChatDetails
            .mockResolvedValueOnce(chatWithoutReply())
            .mockResolvedValueOnce(chatWithReply());

        const {result} = renderHook(() => useStreamRecovery(options));

        act(() => {
            result.current.beginRecovery({recoveryChatId: 'chat-1', userMessageId: 'user-1'});
        });

        await waitFor(() => {
            expect(options.reloadChatHistory).toHaveBeenCalled();
        }, {timeout: 5000});

        expect(chatService.findChatDetails.mock.calls.length).toBeGreaterThanOrEqual(2);
    }, 10000);

    it('survives a failed poll and retries', async () => {
        chatService.findChatDetails
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce(chatWithReply());

        const {result} = renderHook(() => useStreamRecovery(options));

        act(() => {
            result.current.beginRecovery({recoveryChatId: 'chat-1', userMessageId: 'user-1'});
        });

        await waitFor(() => {
            expect(options.reloadChatHistory).toHaveBeenCalled();
        }, {timeout: 5000});

        expect(result.current.recoveryFailed).toBe(false);
    }, 10000);

    it('stops polling when cancelled', async () => {
        chatService.findChatDetails.mockResolvedValue(chatWithoutReply());

        const {result} = renderHook(() => useStreamRecovery(options));

        act(() => {
            result.current.beginRecovery({recoveryChatId: 'chat-1', userMessageId: 'user-1'});
        });

        await waitFor(() => {
            expect(chatService.findChatDetails).toHaveBeenCalled();
        });

        act(() => {
            result.current.cancelActiveRecovery();
        });

        const callCountAtCancel = chatService.findChatDetails.mock.calls.length;
        expect(result.current.recovering).toBe(false);

        await new Promise((resolve) => setTimeout(resolve, 1500));

        expect(chatService.findChatDetails.mock.calls.length).toBe(callCountAtCancel);
        expect(options.reloadChatHistory).not.toHaveBeenCalled();
    }, 10000);

    it('never attempts a resume without a chunk handler to route the replay through', async () => {
        const {result} = renderHook(() => useStreamRecovery(options));

        act(() => {
            result.current.beginRecovery({recoveryChatId: 'chat-1', userMessageId: 'user-1'});
        });

        await waitFor(() => {
            expect(options.reloadChatHistory).toHaveBeenCalled();
        });

        expect(chatService.chatStreamResume).not.toHaveBeenCalled();
    });

    it('stops polling when the hook unmounts', async () => {
        chatService.findChatDetails.mockResolvedValue(chatWithoutReply());

        const {result, unmount} = renderHook(() => useStreamRecovery(options));

        act(() => {
            result.current.beginRecovery({recoveryChatId: 'chat-1', userMessageId: 'user-1'});
        });

        await waitFor(() => {
            expect(chatService.findChatDetails).toHaveBeenCalled();
        });

        unmount();

        const callCountAtUnmount = chatService.findChatDetails.mock.calls.length;

        await new Promise((resolve) => setTimeout(resolve, 1500));

        expect(chatService.findChatDetails.mock.calls.length).toBe(callCountAtUnmount);
    }, 10000);
});

describe('resuming a dropped stream', () => {
    let options;
    let onResumeChunk;

    /* A real cursor: `<millisecondsSinceEpoch>-<sequence>`, not a counter. */
    const LAST_EVENT_ID = '1754062831251-1';

    function beginResume(result, overrides = {}) {
        act(() => {
            result.current.beginRecovery({
                recoveryChatId: 'chat-1',
                userMessageId: 'user-1',
                lastEventId: LAST_EVENT_ID,
                onResumeChunk,
                ...overrides,
            });
        });
    }

    beforeEach(() => {
        isPageHidden.mockReturnValue(false);
        observePageResumed.mockImplementation(() => () => {});
        chatService.findChatDetails.mockResolvedValue(chatWithReply());
        onResumeChunk = vi.fn();

        options = {
            reloadChatHistory: vi.fn().mockResolvedValue(undefined),
            stopStreamingLastAIMessage: vi.fn(),
            markLastAIMessageReconnecting: vi.fn(),
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('replays the missed frames and never falls back to reconciling', async () => {
        chatService.chatStreamResume.mockImplementation(async (chatId, lastEventId, {onChunk}) => {
            onChunk({event: 'chunk', id: '1754062831260-0', data: '{"content":"rest of it"}'});
            onChunk({event: 'done', id: '1754062831270-0', data: '{"chatId":"chat-1"}'});

            return 'streamed';
        });

        const {result} = renderHook(() => useStreamRecovery(options));
        beginResume(result);

        await waitFor(() => {
            expect(result.current.recovering).toBe(false);
        });

        expect(onResumeChunk).toHaveBeenCalledTimes(2);
        expect(chatService.findChatDetails).not.toHaveBeenCalled();
        expect(options.reloadChatHistory).not.toHaveBeenCalled();
        expect(result.current.recoveryFailed).toBe(false);
    });

    it('sends the cursor back verbatim rather than as a number', async () => {
        chatService.chatStreamResume.mockImplementation(async (chatId, lastEventId, {onChunk}) => {
            onChunk({event: 'done', id: '1754062831270-0', data: '{}'});

            return 'streamed';
        });

        const {result} = renderHook(() => useStreamRecovery(options));
        beginResume(result);

        await waitFor(() => {
            expect(chatService.chatStreamResume).toHaveBeenCalled();
        });

        const [passedChatId, passedLastEventId] = chatService.chatStreamResume.mock.calls[0];
        expect(passedChatId).toBe('chat-1');
        expect(passedLastEventId).toBe(LAST_EVENT_ID);
        expect(typeof passedLastEventId).toBe('string');
    });

    it('finalizes without polling when the server says we already have every frame', async () => {
        chatService.chatStreamResume.mockResolvedValue('alreadyComplete');

        const {result} = renderHook(() => useStreamRecovery(options));
        beginResume(result);

        await waitFor(() => {
            expect(options.reloadChatHistory).toHaveBeenCalled();
        });

        expect(chatService.findChatDetails).not.toHaveBeenCalled();
        expect(options.stopStreamingLastAIMessage).toHaveBeenCalled();
        expect(result.current.recoveryFailed).toBe(false);
    });

    it('reconciles from history when the buffer has aged out', async () => {
        chatService.chatStreamResume.mockResolvedValue('unavailable');

        const {result} = renderHook(() => useStreamRecovery(options));
        beginResume(result);

        await waitFor(() => {
            expect(options.reloadChatHistory).toHaveBeenCalled();
        });

        expect(chatService.findChatDetails).toHaveBeenCalledWith('chat-1');
    });

    it('reconciles from history when the resume request itself fails', async () => {
        chatService.chatStreamResume.mockRejectedValue(new TypeError('Load failed'));

        const {result} = renderHook(() => useStreamRecovery(options));
        beginResume(result);

        await waitFor(() => {
            expect(options.reloadChatHistory).toHaveBeenCalled();
        });

        expect(chatService.findChatDetails).toHaveBeenCalledWith('chat-1');
    });

    it('reconciles when the resumed stream dies again before a terminal frame', async () => {
        chatService.chatStreamResume.mockImplementation(async (chatId, lastEventId, {onChunk}) => {
            onChunk({event: 'chunk', id: '1754062831260-0', data: '{"content":"partial"}'});

            return 'streamed';
        });

        const {result} = renderHook(() => useStreamRecovery(options));
        beginResume(result);

        await waitFor(() => {
            expect(options.reloadChatHistory).toHaveBeenCalled();
        });

        expect(chatService.findChatDetails).toHaveBeenCalledWith('chat-1');
    });

    it('gives up without polling when the chat is not ours', async () => {
        chatService.chatStreamResume.mockResolvedValue('rejected');

        const {result} = renderHook(() => useStreamRecovery(options));
        beginResume(result);

        await waitFor(() => {
            expect(result.current.recoveryFailed).toBe(true);
        });

        expect(chatService.findChatDetails).not.toHaveBeenCalled();
        expect(options.stopStreamingLastAIMessage).toHaveBeenCalled();
    });

    it('replays from the beginning when no cursor was captured', async () => {
        chatService.chatStreamResume.mockImplementation(async (chatId, lastEventId, {onChunk}) => {
            onChunk({event: 'done', id: '1754062831270-0', data: '{}'});

            return 'streamed';
        });

        const {result} = renderHook(() => useStreamRecovery(options));
        beginResume(result, {lastEventId: null});

        await waitFor(() => {
            expect(chatService.chatStreamResume).toHaveBeenCalled();
        });

        /* ChatService turns a missing cursor into the "0" sentinel; the hook passes it through. */
        expect(chatService.chatStreamResume.mock.calls[0][1]).toBeNull();
    });
});
