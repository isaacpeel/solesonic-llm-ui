import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act, waitFor} from '@testing-library/react';

vi.mock('../../src/service/ChatGroupService.js', () => ({
    default: {
        findGroups: vi.fn(),
        findGroupChats: vi.fn(),
    },
}));

vi.mock('loglevel', () => ({
    default: {error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()},
}));

import useChatGroups from '../../src/hooks/useChatGroups.js';
import chatGroupService from '../../src/service/ChatGroupService.js';

function pageOf(chatIds, {page = 0, last = true, totalElements = chatIds.length} = {}) {
    return {
        chats: chatIds.map(chatId => ({id: chatId, timestamp: 1_700_000_000, groupSortOrder: null})),
        page,
        last,
        totalPages: null,
        totalElements,
    };
}

function chatsOfGroup(result, chatGroupId) {
    return result.current.chatsByGroupId[chatGroupId].chats.map(chat => chat.id);
}

beforeEach(() => {
    chatGroupService.findGroups.mockReset();
    chatGroupService.findGroups.mockResolvedValue([]);
    chatGroupService.findGroupChats.mockReset();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('useChatGroups group list', () => {
    it('loads nothing until the drawer becomes active', () => {
        renderHook(() => useChatGroups({active: false}));

        expect(chatGroupService.findGroups).not.toHaveBeenCalled();
    });

    it('loads the group list once when the drawer opens', async () => {
        chatGroupService.findGroups.mockResolvedValue([
            {id: 'group-1', name: 'Personal'},
            {id: 'group-2', name: 'Work'},
        ]);

        const {result, rerender} = renderHook(
            ({active}) => useChatGroups({active}),
            {initialProps: {active: false}},
        );

        rerender({active: true});

        await waitFor(() => expect(result.current.groups).toHaveLength(2));
        /* Server order — by name, then id — is preserved, not re-sorted here. */
        expect(result.current.groups.map(group => group.name)).toEqual(['Personal', 'Work']);
        expect(chatGroupService.findGroups).toHaveBeenCalledTimes(1);
    });

    it('refetches the list on demand', async () => {
        const {result} = renderHook(() => useChatGroups({active: true}));

        await waitFor(() => expect(chatGroupService.findGroups).toHaveBeenCalledTimes(1));

        await act(async () => {
            result.current.reloadGroups();
        });

        expect(chatGroupService.findGroups).toHaveBeenCalledTimes(2);
    });

    it('reports a failed list load without throwing', async () => {
        chatGroupService.findGroups.mockRejectedValue(new Error('boom'));

        const {result} = renderHook(() => useChatGroups({active: true}));

        await waitFor(() => expect(result.current.groupsError).not.toBeNull());
        expect(result.current.groups).toEqual([]);
    });
});

describe('useChatGroups group paging', () => {
    it('fetches the first page once, even when the expand is repeated', async () => {
        chatGroupService.findGroupChats.mockResolvedValue(pageOf(['chat-1']));

        const {result} = renderHook(() => useChatGroups({active: true}));

        await act(async () => {
            result.current.loadGroupChats('group-1');
            result.current.loadGroupChats('group-1');
        });

        expect(chatGroupService.findGroupChats).toHaveBeenCalledTimes(1);
        expect(chatGroupService.findGroupChats).toHaveBeenCalledWith('group-1', {page: 0});
        expect(chatsOfGroup(result, 'group-1')).toEqual(['chat-1']);
        expect(result.current.chatsByGroupId['group-1'].totalElements).toBe(1);
    });

    it('appends the following page and then stops asking', async () => {
        chatGroupService.findGroupChats
            .mockResolvedValueOnce(pageOf(['chat-1'], {last: false}))
            .mockResolvedValueOnce(pageOf(['chat-2'], {page: 1, last: true}));

        const {result} = renderHook(() => useChatGroups({active: true}));

        await act(async () => {
            result.current.loadGroupChats('group-1');
        });

        await act(async () => {
            result.current.loadMoreGroupChats('group-1');
        });

        expect(chatGroupService.findGroupChats).toHaveBeenLastCalledWith('group-1', {page: 1});
        expect(chatsOfGroup(result, 'group-1')).toEqual(['chat-1', 'chat-2']);

        act(() => {
            result.current.loadMoreGroupChats('group-1');
        });

        expect(chatGroupService.findGroupChats).toHaveBeenCalledTimes(2);
    });

    it('ignores a load-more while a page for that group is already in flight', async () => {
        let releaseFirstPage;
        chatGroupService.findGroupChats.mockImplementationOnce(() => new Promise(resolve => {
            releaseFirstPage = () => resolve(pageOf(['chat-1'], {last: false}));
        }));

        const {result} = renderHook(() => useChatGroups({active: true}));

        act(() => {
            result.current.loadGroupChats('group-1');
            result.current.loadMoreGroupChats('group-1');
        });

        expect(chatGroupService.findGroupChats).toHaveBeenCalledTimes(1);

        await act(async () => {
            releaseFirstPage();
        });

        expect(chatsOfGroup(result, 'group-1')).toEqual(['chat-1']);
    });

    it('drops a response from a run a reload superseded', async () => {
        let releaseSupersededPage;
        chatGroupService.findGroupChats
            .mockImplementationOnce(() => new Promise(resolve => {
                releaseSupersededPage = () => resolve(pageOf(['stale-chat']));
            }))
            .mockResolvedValueOnce(pageOf(['fresh-chat']));

        const {result} = renderHook(() => useChatGroups({active: true}));

        act(() => {
            result.current.loadGroupChats('group-1');
        });

        await act(async () => {
            result.current.reloadGroupChats('group-1');
        });

        await act(async () => {
            releaseSupersededPage();
        });

        expect(chatsOfGroup(result, 'group-1')).toEqual(['fresh-chat']);
    });

    it('re-arms a group whose first page failed, so re-expanding retries it', async () => {
        chatGroupService.findGroupChats
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce(pageOf(['chat-1']));

        const {result} = renderHook(() => useChatGroups({active: true}));

        await act(async () => {
            result.current.loadGroupChats('group-1');
        });

        expect(result.current.chatsByGroupId['group-1'].error).not.toBeNull();

        await act(async () => {
            result.current.loadGroupChats('group-1');
        });

        expect(chatsOfGroup(result, 'group-1')).toEqual(['chat-1']);
    });
});

describe('useChatGroups row mutators', () => {
    async function twoLoadedGroups() {
        chatGroupService.findGroupChats
            .mockResolvedValueOnce(pageOf(['chat-1', 'chat-2']))
            .mockResolvedValueOnce(pageOf(['chat-9']));

        const rendered = renderHook(() => useChatGroups({active: true}));

        await act(async () => {
            rendered.result.current.loadGroupChats('group-1');
        });

        await act(async () => {
            rendered.result.current.loadGroupChats('group-2');
        });

        return rendered;
    }

    it('replaces, removes and adds only inside the group it is given', async () => {
        const {result} = await twoLoadedGroups();

        act(() => {
            result.current.replaceGroupChat('group-1', {id: 'chat-1', name: 'Renamed'});
            result.current.removeGroupChat('group-1', 'chat-2');
            result.current.addGroupChat('group-1', {id: 'chat-3', timestamp: 1_700_000_000, groupSortOrder: null});
        });

        expect(chatsOfGroup(result, 'group-1')).toEqual(['chat-3', 'chat-1']);
        expect(result.current.chatsByGroupId['group-1'].chats[1].name).toBe('Renamed');
        expect(result.current.chatsByGroupId['group-1'].totalElements).toBe(2);
        expect(chatsOfGroup(result, 'group-2')).toEqual(['chat-9']);
    });

    /* A newly filed conversation has no groupSortOrder, so it must not jump the placed prefix. */
    it('files an incoming conversation after the chats that were placed by hand', async () => {
        chatGroupService.findGroupChats.mockResolvedValue({
            chats: [
                {id: 'pinned', groupSortOrder: 0},
                {id: 'dated', groupSortOrder: null},
            ],
            page: 0,
            last: true,
            totalPages: null,
            totalElements: 2,
        });

        const {result} = renderHook(() => useChatGroups({active: true}));

        await act(async () => {
            result.current.loadGroupChats('group-1');
        });

        act(() => {
            result.current.addGroupChat('group-1', {id: 'incoming', groupSortOrder: null});
        });

        expect(chatsOfGroup(result, 'group-1')).toEqual(['pinned', 'incoming', 'dated']);
    });

    it('leaves a group nobody has expanded alone', async () => {
        const {result} = await twoLoadedGroups();

        act(() => {
            result.current.addGroupChat('group-never-opened', {id: 'chat-x'});
            result.current.removeGroupChat('group-never-opened', 'chat-x');
            result.current.replaceGroupChat('group-never-opened', {id: 'chat-x'});
        });

        expect(result.current.chatsByGroupId['group-never-opened']).toBeUndefined();
    });

    it('replaces a group rendered array wholesale, for an optimistic reorder', async () => {
        const {result} = await twoLoadedGroups();

        act(() => {
            result.current.setGroupChatsDirectly('group-1', [{id: 'chat-2'}, {id: 'chat-1'}]);
        });

        expect(chatsOfGroup(result, 'group-1')).toEqual(['chat-2', 'chat-1']);
        expect(chatsOfGroup(result, 'group-2')).toEqual(['chat-9']);
    });

    /*
     * A reorder that follows a move into this group has to see the conversation that was just added,
     * which the caller's own render has not been given yet.
     */
    it('accepts an updater, applied to whatever the group holds by then', async () => {
        const {result} = await twoLoadedGroups();

        act(() => {
            result.current.addGroupChat('group-1', {id: 'chat-new'});
            result.current.setGroupChatsDirectly('group-1', previousChats => [...previousChats].reverse());
        });

        /* [chat-1, chat-2] with the new one prepended, then reversed by the updater. */
        expect(chatsOfGroup(result, 'group-1')).toEqual(['chat-2', 'chat-1', 'chat-new']);
    });
});
