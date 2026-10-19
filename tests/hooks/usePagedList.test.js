import {renderHook, waitFor, act} from '@testing-library/react';
import {describe, it, expect, vi} from 'vitest';

import usePagedList from '../../src/hooks/usePagedList.js';

const paged = (content, {number = 0, totalPages = 1} = {}) => ({
    content,
    page: {size: 50, number, totalElements: content.length, totalPages},
});

const deferred = () => {
    let resolveDeferred;
    const promise = new Promise((resolve) => {
        resolveDeferred = resolve;
    });

    return {promise, resolve: resolveDeferred};
};

describe('usePagedList', () => {
    it('loads the first page on mount', async () => {
        const fetchPage = vi.fn().mockResolvedValue(paged([{id: 'a'}], {totalPages: 2}));

        const {result} = renderHook(() => usePagedList(fetchPage, 'identity-a'));

        await waitFor(() => expect(result.current.items).toEqual([{id: 'a'}]));

        expect(fetchPage).toHaveBeenCalledWith(0);
        expect(result.current.hasMore).toBe(true);
        expect(result.current.loaded).toBe(true);
    });

    it('appends the next page and stops once every page is loaded', async () => {
        const fetchPage = vi.fn().mockImplementation(async (page) => paged(
            [{id: `item-${page}`}],
            {number: page, totalPages: 2},
        ));

        const {result} = renderHook(() => usePagedList(fetchPage, 'identity-a'));

        await waitFor(() => expect(result.current.items).toHaveLength(1));

        await act(async () => {
            await result.current.loadNextPage();
        });

        expect(result.current.items).toEqual([{id: 'item-0'}, {id: 'item-1'}]);
        expect(fetchPage).toHaveBeenCalledWith(1);
        expect(result.current.hasMore).toBe(false);

        await act(async () => {
            await result.current.loadNextPage();
        });

        expect(fetchPage).toHaveBeenCalledTimes(2);
    });

    it('starts over when the identity changes and drops the stale response', async () => {
        const pendingFirstIdentity = deferred();
        const fetchFor = (identity) => async () => {
            if (identity === 'identity-a') {
                return pendingFirstIdentity.promise;
            }

            return paged([{id: 'from-b'}]);
        };

        const {result, rerender} = renderHook(
            ({identity}) => usePagedList(fetchFor(identity), identity),
            {initialProps: {identity: 'identity-a'}},
        );

        rerender({identity: 'identity-b'});

        await waitFor(() => expect(result.current.items).toEqual([{id: 'from-b'}]));

        await act(async () => {
            pendingFirstIdentity.resolve(paged([{id: 'from-a'}]));
        });

        expect(result.current.items).toEqual([{id: 'from-b'}]);
    });

    it('clears loaded items as soon as the identity changes', async () => {
        const pendingSecondIdentity = deferred();
        const fetchFor = (identity) => async () => {
            if (identity === 'identity-a') {
                return paged([{id: 'from-a'}]);
            }

            return pendingSecondIdentity.promise;
        };

        const {result, rerender} = renderHook(
            ({identity}) => usePagedList(fetchFor(identity), identity),
            {initialProps: {identity: 'identity-a'}},
        );

        await waitFor(() => expect(result.current.items).toEqual([{id: 'from-a'}]));

        rerender({identity: 'identity-b'});

        expect(result.current.items).toEqual([]);
        expect(result.current.loaded).toBe(false);
    });

    it('reports a failed load and reloads on request', async () => {
        const failure = new Error('network down');
        const fetchPage = vi.fn()
            .mockRejectedValueOnce(failure)
            .mockResolvedValue(paged([{id: 'a'}]));

        const {result} = renderHook(() => usePagedList(fetchPage, 'identity-a'));

        await waitFor(() => expect(result.current.loadError).toBe(failure));

        act(() => {
            result.current.reload();
        });

        await waitFor(() => expect(result.current.items).toEqual([{id: 'a'}]));
        expect(result.current.loadError).toBeNull();
    });

    it('skips items already loaded when a later page overlaps after a local change', async () => {
        const fetchPage = vi.fn().mockImplementation(async (page) => {
            if (page === 0) {
                return paged([{id: 'a'}, {id: 'b'}], {totalPages: 2});
            }

            return paged([{id: 'b'}, {id: 'c'}], {number: 1, totalPages: 2});
        });

        const {result} = renderHook(() => usePagedList(fetchPage, 'identity-a'));

        await waitFor(() => expect(result.current.items).toHaveLength(2));

        await act(async () => {
            await result.current.loadNextPage();
        });

        expect(result.current.items).toEqual([{id: 'a'}, {id: 'b'}, {id: 'c'}]);
    });

    it('dedupes by the key the caller supplies', async () => {
        const fetchPage = vi.fn().mockImplementation(async (page) => paged(
            [{chatId: 'chat-1'}, {chatId: `chat-${page + 2}`}],
            {number: page, totalPages: 2},
        ));

        const {result} = renderHook(() => usePagedList(fetchPage, 'identity-a', (item) => item.chatId));

        await waitFor(() => expect(result.current.items).toHaveLength(2));

        await act(async () => {
            await result.current.loadNextPage();
        });

        expect(result.current.items.map((item) => item.chatId)).toEqual(['chat-1', 'chat-2', 'chat-3']);
    });

    it('lets the caller edit loaded items in place', async () => {
        const fetchPage = vi.fn().mockResolvedValue(paged([{id: 'a'}, {id: 'b'}]));

        const {result} = renderHook(() => usePagedList(fetchPage, 'identity-a'));

        await waitFor(() => expect(result.current.items).toHaveLength(2));

        act(() => {
            result.current.setItems((currentItems) => currentItems.filter((item) => item.id !== 'a'));
        });

        expect(result.current.items).toEqual([{id: 'b'}]);
    });
});
