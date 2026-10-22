import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act, waitFor} from '@testing-library/react';
import useStreamRecovery, {hasSettledTurn} from '../../src/hooks/useStreamRecovery.js';

vi.mock('../../src/service/AuthService.js', () => ({
    default: {},
}));

vi.mock('../../src/service/ChatService.js', () => ({
    default: {
        findChatDetails: vi.fn(),
        chatStreamResume: vi.fn(),
    },
    TERMINAL_RUN_EVENTS: ['RUN_FINISHED', 'RUN_ERROR'],
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

describe('hasSettledTurn', () => {
    it('is true for an assistant reply after the anchored user message', () => {
        expect(hasSettledTurn(chatWithReply(), 'user-1')).toBe(true);
    });

    it('is false when the turn is still generating', () => {
        expect(hasSettledTurn(chatWithoutReply(), 'user-1')).toBe(false);
    });

    it('ignores an assistant reply that precedes this turn', () => {
        const chatDetails = {
            chatMessages: [
                {id: 'user-0', messageType: 'USER', message: 'earlier question'},
                {id: 'ai-0', messageType: 'ASSISTANT', message: 'earlier answer'},
                {id: 'user-1', messageType: 'USER', message: 'question'},
            ],
        };

        expect(hasSettledTurn(chatDetails, 'user-1')).toBe(false);
    });

    it('falls back to the last user message when no id was adopted', () => {
        expect(hasSettledTurn(chatWithReply(), null)).toBe(true);
        expect(hasSettledTurn(chatWithoutReply(), null)).toBe(false);
    });

    it('does not count a progress row as the reply', () => {
        const chatDetails = {
            chatMessages: [
                {id: 'user-1', messageType: 'USER', message: 'question'},
                {id: 'progress-1', messageType: 'ASSISTANT', message: 'Reading image', progressData: {message: 'Reading image'}},
            ],
        };

        expect(hasSettledTurn(chatDetails, 'user-1')).toBe(false);
    });

    it('does not count an empty reply', () => {
        const chatDetails = {
            chatMessages: [
                {id: 'user-1', messageType: 'USER', message: 'question'},
                {id: 'ai-1', messageType: 'ASSISTANT', message: '   '},
            ],
        };

        expect(hasSettledTurn(chatDetails, 'user-1')).toBe(false);
    });

    it('counts a reply that carries only a generated image', () => {
        const chatDetails = {
            chatMessages: [
                {id: 'user-1', messageType: 'USER', message: '/generate_image a lighthouse'},
                {id: 'ai-1', messageType: 'ASSISTANT', message: '', generatedImages: [{imageId: 'image-1'}]},
            ],
        };

        expect(hasSettledTurn(chatDetails, 'user-1')).toBe(true);
    });

    it('counts the system message a cancelled turn writes', () => {
        const chatDetails = {
            chatMessages: [
                {id: 'user-1', messageType: 'USER', message: 'question'},
                {id: 'system-1', messageType: 'SYSTEM', message: 'Chat canceled.'},
            ],
        };

        expect(hasSettledTurn(chatDetails, 'user-1')).toBe(true);
    });

    it('does not count an answered elicitation, which lands mid-turn', () => {
        const chatDetails = {
            chatMessages: [
                {id: 'user-1', messageType: 'USER', message: 'assign it'},
                {id: 'system-1', messageType: 'SYSTEM', message: '', elicitationId: 'elicitation-1', elicitationResponse: {action: 'accept'}},
            ],
        };

        expect(hasSettledTurn(chatDetails, 'user-1')).toBe(false);
    });

    it('is false for an empty or malformed response', () => {
        expect(hasSettledTurn(null, 'user-1')).toBe(false);
        expect(hasSettledTurn({chatMessages: []}, 'user-1')).toBe(false);
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
        expect(options.stopStreamingLastAIMessage).not.toHaveBeenCalled();
    });

    it('reconciles the bubble once the reply is persisted', async () => {
        const {result} = renderHook(() => useStreamRecovery(options));

        act(() => {
            result.current.beginRecovery({recoveryChatId: 'chat-1', userMessageId: 'user-1'});
        });

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

    it('does nothing when there is no active recovery to cancel', () => {
        const {result} = renderHook(() => useStreamRecovery(options));

        act(() => {
            result.current.cancelActiveRecovery();
        });

        expect(result.current.recovering).toBe(false);
    });

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
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('replays the missed frames and never falls back to reconciling', async () => {
        chatService.chatStreamResume.mockImplementation(async (chatId, lastEventId, {onChunk}) => {
            onChunk({event: 'TEXT_MESSAGE_CONTENT', id: '1754062831260-0', data: '{"delta":"rest of it"}'});
            onChunk({event: 'RUN_FINISHED', id: '1754062831270-0', data: '{"result":{"id":"chat-1"}}'});

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
            onChunk({event: 'RUN_FINISHED', id: '1754062831270-0', data: '{}'});

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

    it('retries a resume request that fails outright', async () => {
        chatService.chatStreamResume
            .mockRejectedValueOnce(new TypeError('Load failed'))
            .mockImplementationOnce(async (chatId, lastEventId, {onChunk}) => {
                onChunk({event: 'RUN_FINISHED', id: '1754062831270-0', data: '{}'});

                return 'streamed';
            });

        const {result} = renderHook(() => useStreamRecovery(options));
        beginResume(result);

        await waitFor(() => {
            expect(result.current.recovering).toBe(false);
        }, {timeout: 5000});

        expect(chatService.chatStreamResume).toHaveBeenCalledTimes(2);
        expect(chatService.findChatDetails).not.toHaveBeenCalled();
        expect(result.current.recoveryFailed).toBe(false);
    }, 10000);

    it('resumes again from the advanced cursor when the resumed stream dies early', async () => {
        chatService.chatStreamResume
            .mockImplementationOnce(async (chatId, lastEventId, {onChunk}) => {
                onChunk({event: 'TEXT_MESSAGE_CONTENT', id: '1754062831260-0', data: '{"delta":"partial"}'});

                return 'streamed';
            })
            .mockImplementationOnce(async (chatId, lastEventId, {onChunk}) => {
                onChunk({event: 'RUN_FINISHED', id: '1754062831270-0', data: '{}'});

                return 'streamed';
            });

        const {result} = renderHook(() => useStreamRecovery(options));
        beginResume(result);

        await waitFor(() => {
            expect(result.current.recovering).toBe(false);
        });

        expect(chatService.chatStreamResume).toHaveBeenCalledTimes(2);
        expect(chatService.chatStreamResume.mock.calls[1][1]).toBe('1754062831260-0');
        expect(onResumeChunk).toHaveBeenCalledTimes(2);
        expect(chatService.findChatDetails).not.toHaveBeenCalled();
    });

    it('reconciles from history once resuming keeps failing', async () => {
        vi.useFakeTimers();

        try {
            chatService.chatStreamResume.mockRejectedValue(new TypeError('Load failed'));

            const {result} = renderHook(() => useStreamRecovery(options));
            beginResume(result);

            await act(async () => {
                await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
            });

            expect(chatService.chatStreamResume.mock.calls.length).toBeGreaterThan(1);
            expect(chatService.findChatDetails).toHaveBeenCalledWith('chat-1');
            expect(options.reloadChatHistory).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('aborts the resume request it has open when recovery is cancelled', async () => {
        let resumeSignal = null;
        chatService.chatStreamResume.mockImplementation((chatId, lastEventId, {signal}) => {
            resumeSignal = signal;

            return new Promise(() => {});
        });

        const {result} = renderHook(() => useStreamRecovery(options));
        beginResume(result);

        await waitFor(() => {
            expect(resumeSignal).not.toBeNull();
        });

        expect(resumeSignal.aborted).toBe(false);

        act(() => {
            result.current.cancelActiveRecovery();
        });

        expect(resumeSignal.aborted).toBe(true);
    });

    it('backs off when frames arrive without moving the cursor', async () => {
        vi.useFakeTimers();

        try {
            chatService.chatStreamResume.mockImplementation(async (chatId, lastEventId, {onChunk}) => {
                onChunk({event: 'CUSTOM', data: '{}'});

                return 'streamed';
            });

            const {result} = renderHook(() => useStreamRecovery(options));
            beginResume(result);

            await act(async () => {
                await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
            });

            expect(chatService.chatStreamResume.mock.calls.length).toBeLessThanOrEqual(10);
            expect(chatService.findChatDetails).toHaveBeenCalledWith('chat-1');
        } finally {
            vi.useRealTimers();
        }
    });

    it('stays quiet when entering a chat whose turn the server no longer has', async () => {
        chatService.chatStreamResume.mockResolvedValue('unavailable');

        const {result} = renderHook(() => useStreamRecovery(options));
        beginResume(result, {quietWhenUnavailable: true});

        await waitFor(() => {
            expect(options.reloadChatHistory).toHaveBeenCalled();
        });

        expect(chatService.findChatDetails).not.toHaveBeenCalled();
        expect(options.stopStreamingLastAIMessage).toHaveBeenCalled();
        expect(result.current.recoveryFailed).toBe(false);
    });

    it('stays quiet when entering a chat the resume refuses', async () => {
        chatService.chatStreamResume.mockResolvedValue('rejected');

        const {result} = renderHook(() => useStreamRecovery(options));
        beginResume(result, {quietWhenUnavailable: true});

        await waitFor(() => {
            expect(options.reloadChatHistory).toHaveBeenCalled();
        });

        expect(result.current.recoveryFailed).toBe(false);
    });

    it('waits for the network to come back before resuming', async () => {
        vi.stubGlobal('navigator', {onLine: false});

        try {
            chatService.chatStreamResume.mockImplementation(async (chatId, lastEventId, {onChunk}) => {
                onChunk({event: 'RUN_FINISHED', id: '1754062831270-0', data: '{}'});

                return 'streamed';
            });

            const {result} = renderHook(() => useStreamRecovery(options));
            beginResume(result);

            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(chatService.chatStreamResume).not.toHaveBeenCalled();

            vi.stubGlobal('navigator', {onLine: true});

            await act(async () => {
                window.dispatchEvent(new Event('online'));
            });

            await waitFor(() => {
                expect(chatService.chatStreamResume).toHaveBeenCalledTimes(1);
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('treats a replayed RUN_ERROR as terminal rather than reconciling', async () => {
        chatService.chatStreamResume.mockImplementation(async (chatId, lastEventId, {onChunk}) => {
            onChunk({event: 'RUN_ERROR', id: '1754062831270-0', data: '{"message":"boom","code":"internal"}'});

            return 'streamed';
        });

        const {result} = renderHook(() => useStreamRecovery(options));
        beginResume(result);

        await waitFor(() => {
            expect(result.current.recovering).toBe(false);
        });

        expect(chatService.findChatDetails).not.toHaveBeenCalled();
        expect(onResumeChunk).toHaveBeenCalledTimes(1);
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
            onChunk({event: 'RUN_FINISHED', id: '1754062831270-0', data: '{}'});

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
