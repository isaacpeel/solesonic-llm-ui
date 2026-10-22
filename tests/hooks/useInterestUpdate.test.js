import {describe, it, expect, vi, beforeEach} from 'vitest';
import {renderHook, waitFor, act} from '@testing-library/react';

vi.mock('../../src/service/InterestService.js', () => ({
    default: {
        getUpdateForChat: vi.fn(),
    },
}));

import useInterestUpdate from '../../src/hooks/useInterestUpdate.js';
import interestService from '../../src/service/InterestService.js';

const updateFor = (chatId) => ({id: `update-${chatId}`, agentId: 'agent-1', label: 'Formula 1', chatId, itemCount: 3});

function deferred() {
    let resolve;
    const promise = new Promise((resolver) => {
        resolve = resolver;
    });

    return {promise, resolve};
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('useInterestUpdate', () => {
    it('answers the update behind a news chat', async () => {
        interestService.getUpdateForChat.mockResolvedValue(updateFor('chat-1'));

        const {result} = renderHook(() => useInterestUpdate('chat-1'));

        await waitFor(() => expect(result.current).toEqual(updateFor('chat-1')));
        expect(interestService.getUpdateForChat).toHaveBeenCalledWith('chat-1');
    });

    it('answers null for an ordinary chat', async () => {
        interestService.getUpdateForChat.mockResolvedValue(null);

        const {result} = renderHook(() => useInterestUpdate('chat-1'));

        await waitFor(() => expect(interestService.getUpdateForChat).toHaveBeenCalled());
        expect(result.current).toBeNull();
    });

    it('asks nothing without a chat', () => {
        const {result} = renderHook(() => useInterestUpdate(null));

        expect(result.current).toBeNull();
        expect(interestService.getUpdateForChat).not.toHaveBeenCalled();
    });

    it('answers null when the lookup fails', async () => {
        interestService.getUpdateForChat.mockRejectedValue(new Error('network down'));

        const {result} = renderHook(() => useInterestUpdate('chat-1'));

        await waitFor(() => expect(interestService.getUpdateForChat).toHaveBeenCalled());
        expect(result.current).toBeNull();
    });

    it('ignores a stale answer after a rapid chat switch', async () => {
        const firstLookup = deferred();
        const secondLookup = deferred();
        interestService.getUpdateForChat
            .mockReturnValueOnce(firstLookup.promise)
            .mockReturnValueOnce(secondLookup.promise);

        const {result, rerender} = renderHook(({chatId}) => useInterestUpdate(chatId), {initialProps: {chatId: 'chat-1'}});
        rerender({chatId: 'chat-2'});

        await act(async () => {
            secondLookup.resolve(null);
            firstLookup.resolve(updateFor('chat-1'));
            await Promise.resolve();
        });

        expect(result.current).toBeNull();
    });

    it('drops the previous chat\'s update as soon as the chat changes', async () => {
        interestService.getUpdateForChat
            .mockResolvedValueOnce(updateFor('chat-1'))
            .mockReturnValueOnce(new Promise(() => {}));

        const {result, rerender} = renderHook(({chatId}) => useInterestUpdate(chatId), {initialProps: {chatId: 'chat-1'}});
        await waitFor(() => expect(result.current).not.toBeNull());

        rerender({chatId: 'chat-2'});

        expect(result.current).toBeNull();
    });
});
