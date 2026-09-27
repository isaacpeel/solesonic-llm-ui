import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act, waitFor} from '@testing-library/react';

vi.mock('../../src/service/ChatService.js', () => ({
    default: {
        findChatHistory: vi.fn(),
    },
    /* The hook imports the page size constant directly; the mock must carry it. */
    DEFAULT_CHAT_HISTORY_PAGE_SIZE: 20,
}));

import usePagedChatHistory from '../../src/hooks/usePagedChatHistory.js';
import chatService from '../../src/service/ChatService.js';

function pageOf(chatIds, {page = 0, last = false} = {}) {
    return {
        chats: chatIds.map(chatId => ({id: chatId, timestamp: 1_700_000_000})),
        page,
        last,
        totalPages: null,
        totalElements: null,
    };
}

beforeEach(() => {
    chatService.findChatHistory.mockReset();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('usePagedChatHistory', () => {
    it('loads nothing until it is activated', async () => {
        const {result} = renderHook(() => usePagedChatHistory({active: false, reloadTrigger: 0, userId: 'user-1'}));

        expect(chatService.findChatHistory).not.toHaveBeenCalled();
        expect(result.current.chats).toEqual([]);
    });

    it('requests only the first page when activated', async () => {
        chatService.findChatHistory.mockResolvedValue(pageOf(['chat-1', 'chat-2']));

        const {result} = renderHook(() => usePagedChatHistory({active: true, reloadTrigger: 0, userId: 'user-1'}));

        await waitFor(() => expect(result.current.chats).toHaveLength(2));
        expect(chatService.findChatHistory).toHaveBeenCalledTimes(1);
        expect(chatService.findChatHistory).toHaveBeenCalledWith({page: 0, size: 20});
        expect(result.current.hasMore).toBe(true);
    });

    it('appends the following page when more is requested', async () => {
        chatService.findChatHistory
            .mockResolvedValueOnce(pageOf(['chat-1']))
            .mockResolvedValueOnce(pageOf(['chat-2'], {page: 1}));

        const {result} = renderHook(() => usePagedChatHistory({active: true, reloadTrigger: 0, userId: 'user-1'}));

        await waitFor(() => expect(result.current.chats).toHaveLength(1));

        await act(async () => {
            result.current.loadMore();
        });

        expect(chatService.findChatHistory).toHaveBeenLastCalledWith({page: 1, size: 20});
        expect(result.current.chats.map(chat => chat.id)).toEqual(['chat-1', 'chat-2']);
    });

    it('drops rows a later page re-delivers after the list shifted', async () => {
        chatService.findChatHistory
            .mockResolvedValueOnce(pageOf(['chat-1', 'chat-2']))
            .mockResolvedValueOnce(pageOf(['chat-2', 'chat-3'], {page: 1}));

        const {result} = renderHook(() => usePagedChatHistory({active: true, reloadTrigger: 0, userId: 'user-1'}));

        await waitFor(() => expect(result.current.chats).toHaveLength(2));

        await act(async () => {
            result.current.loadMore();
        });

        expect(result.current.chats.map(chat => chat.id)).toEqual(['chat-1', 'chat-2', 'chat-3']);
    });

    it('ignores repeated loadMore calls while a page is in flight', async () => {
        let releaseFirstPage;
        chatService.findChatHistory.mockImplementationOnce(() => new Promise(resolve => {
            releaseFirstPage = () => resolve(pageOf(['chat-1']));
        }));

        const {result} = renderHook(() => usePagedChatHistory({active: true, reloadTrigger: 0, userId: 'user-1'}));

        act(() => {
            result.current.loadMore();
            result.current.loadMore();
        });

        expect(chatService.findChatHistory).toHaveBeenCalledTimes(1);

        await act(async () => {
            releaseFirstPage();
        });

        expect(result.current.chats).toHaveLength(1);
    });

    it('stops paging once the final page arrives', async () => {
        chatService.findChatHistory.mockResolvedValue(pageOf(['chat-1'], {last: true}));

        const {result} = renderHook(() => usePagedChatHistory({active: true, reloadTrigger: 0, userId: 'user-1'}));

        await waitFor(() => expect(result.current.hasMore).toBe(false));

        act(() => {
            result.current.loadMore();
        });

        expect(chatService.findChatHistory).toHaveBeenCalledTimes(1);
    });

    it('parks paging on a failure and retries the same page', async () => {
        chatService.findChatHistory
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce(pageOf(['chat-1'], {last: true}));

        const {result} = renderHook(() => usePagedChatHistory({active: true, reloadTrigger: 0, userId: 'user-1'}));

        await waitFor(() => expect(result.current.error).not.toBeNull());
        expect(result.current.hasMore).toBe(false);

        await act(async () => {
            result.current.retry();
        });

        expect(chatService.findChatHistory).toHaveBeenLastCalledWith({page: 0, size: 20});
        expect(result.current.error).toBeNull();
        expect(result.current.chats).toHaveLength(1);
    });

    it('replaces one chat in place, without refetching', async () => {
        chatService.findChatHistory.mockResolvedValue(pageOf(['chat-1', 'chat-2', 'chat-3']));

        const {result} = renderHook(() => usePagedChatHistory({active: true, reloadTrigger: 0, userId: 'user-1'}));

        await waitFor(() => expect(result.current.chats).toHaveLength(3));

        act(() => {
            result.current.replaceChat({id: 'chat-2', name: 'Trip planning'});
        });

        expect(result.current.chats.map(chat => chat.id)).toEqual(['chat-1', 'chat-2', 'chat-3']);
        expect(result.current.chats[1].name).toBe('Trip planning');
        /* The merge is a patch: the fields the caller left out survive. */
        expect(result.current.chats[1].timestamp).toBe(1_700_000_000);
        expect(chatService.findChatHistory).toHaveBeenCalledTimes(1);
    });

    it('drops one chat and leaves the rest, without refetching', async () => {
        chatService.findChatHistory.mockResolvedValue(pageOf(['chat-1', 'chat-2', 'chat-3']));

        const {result} = renderHook(() => usePagedChatHistory({active: true, reloadTrigger: 0, userId: 'user-1'}));

        await waitFor(() => expect(result.current.chats).toHaveLength(3));

        act(() => {
            result.current.removeChat('chat-2');
        });

        expect(result.current.chats.map(chat => chat.id)).toEqual(['chat-1', 'chat-3']);
        expect(chatService.findChatHistory).toHaveBeenCalledTimes(1);
    });

    /* Filing and unfiling a conversation is a patch of chatGroupId, not a remove and a re-add. */
    it('patches a chat that is already loaded rather than duplicating it', async () => {
        chatService.findChatHistory.mockResolvedValue(pageOf(['chat-1', 'chat-2']));

        const {result} = renderHook(() => usePagedChatHistory({active: true, reloadTrigger: 0, userId: 'user-1'}));

        await waitFor(() => expect(result.current.chats).toHaveLength(2));

        act(() => {
            result.current.upsertChat({id: 'chat-2', chatGroupId: 'group-1'});
        });

        expect(result.current.chats.map(chat => chat.id)).toEqual(['chat-1', 'chat-2']);
        expect(result.current.chats[1].chatGroupId).toBe('group-1');
        expect(result.current.chats[1].timestamp).toBe(1_700_000_000);
    });

    /* A conversation pulled out of a group may never have been on a page the drawer has loaded. */
    it('inserts a chat it has never seen', async () => {
        chatService.findChatHistory.mockResolvedValue(pageOf(['chat-1']));

        const {result} = renderHook(() => usePagedChatHistory({active: true, reloadTrigger: 0, userId: 'user-1'}));

        await waitFor(() => expect(result.current.chats).toHaveLength(1));

        act(() => {
            result.current.upsertChat({id: 'chat-9', chatGroupId: null});
        });

        expect(result.current.chats.map(chat => chat.id)).toEqual(['chat-9', 'chat-1']);
        expect(chatService.findChatHistory).toHaveBeenCalledTimes(1);
    });

    /* A reorder rearranges the whole list, so it is a replacement rather than a patch of one row. */
    it('replaces the accumulated list wholesale, without refetching', async () => {
        chatService.findChatHistory.mockResolvedValue(pageOf(['chat-1', 'chat-2', 'chat-3']));

        const {result} = renderHook(() => usePagedChatHistory({active: true, reloadTrigger: 0, userId: 'user-1'}));

        await waitFor(() => expect(result.current.chats).toHaveLength(3));

        const rearranged = [
            {id: 'chat-3', sortOrder: 0},
            {id: 'chat-1', sortOrder: null},
            {id: 'chat-2', sortOrder: null},
        ];

        act(() => {
            result.current.setChatsDirectly(rearranged);
        });

        expect(result.current.chats.map(chat => chat.id)).toEqual(['chat-3', 'chat-1', 'chat-2']);
        expect(chatService.findChatHistory).toHaveBeenCalledTimes(1);
    });

    it('restarts from the first page when the list is invalidated', async () => {
        chatService.findChatHistory
            .mockResolvedValueOnce(pageOf(['chat-1']))
            .mockResolvedValueOnce(pageOf(['chat-2'], {page: 1}))
            .mockResolvedValueOnce(pageOf(['chat-9', 'chat-1']));

        const {result, rerender} = renderHook(
            ({reloadTrigger}) => usePagedChatHistory({active: true, reloadTrigger, userId: 'user-1'}),
            {initialProps: {reloadTrigger: 0}},
        );

        await waitFor(() => expect(result.current.chats).toHaveLength(1));

        await act(async () => {
            result.current.loadMore();
        });

        expect(result.current.chats).toHaveLength(2);

        rerender({reloadTrigger: 1});

        await waitFor(() => expect(result.current.chats.map(chat => chat.id)).toEqual(['chat-9', 'chat-1']));
        expect(chatService.findChatHistory).toHaveBeenLastCalledWith({page: 0, size: 20});
    });
});
