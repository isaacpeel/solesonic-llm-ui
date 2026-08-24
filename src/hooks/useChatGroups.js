import {useCallback, useEffect, useRef, useState} from 'react';
import log from 'loglevel';
import chatGroupService from '../service/ChatGroupService.js';
import {partitionPlacedChats} from '../util/chatHistoryGrouping.js';

/* The column a group's own ordering is kept in. Never `sortOrder` — that one is the whole list. */
const GROUP_ORDER_FIELD = 'groupSortOrder';

const NO_GROUPS = [];

/**
 * The user's conversation groups, plus each group's lazily paged conversations.
 *
 * The group list itself is small and unpaged, so it is fetched whole when the drawer becomes
 * `active` — the same trigger `usePagedChatHistory` uses. A group's chats are a different matter:
 * they are only requested when the group is first expanded, and they are kept afterwards, so
 * collapsing and re-expanding costs nothing. They are also kept across a re-open of the drawer,
 * because the expand/collapse state lives in the drawer and discarding the pages under it would
 * leave an expanded group rendering as empty with nothing left to trigger a refetch.
 *
 * Paging discipline mirrors `usePagedChatHistory`, per group: a ref-held `loading` flag so a
 * repeated `loadMoreGroupChats` cannot request the same page twice, and a generation counter so a
 * response from a superseded run is dropped rather than appended onto a freshly reloaded list.
 */
function useChatGroups({active}) {
    const [groups, setGroups] = useState(NO_GROUPS);
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [groupsError, setGroupsError] = useState(null);
    const [chatsByGroupId, setChatsByGroupId] = useState({});
    const [groupsReloadTrigger, setGroupsReloadTrigger] = useState(0);

    /* Bumped per list request, so a slow response cannot overwrite a newer one. */
    const groupsRequestRef = useRef(0);

    /* groupId -> {loading, nextPage, last, started, generation} */
    const groupPagingRef = useRef(new Map());

    useEffect(() => {
        if (!active) {
            return;
        }

        groupsRequestRef.current += 1;
        const requestNumber = groupsRequestRef.current;

        setGroupsLoading(true);

        async function loadGroups() {
            try {
                const loadedGroups = await chatGroupService.findGroups();

                if (requestNumber !== groupsRequestRef.current) {
                    return;
                }

                /* A plain array, ordered by name then id. Rendered in that order, never re-sorted. */
                setGroups(Array.isArray(loadedGroups) ? loadedGroups : NO_GROUPS);
                setGroupsError(null);
            } catch (caughtError) {
                if (requestNumber !== groupsRequestRef.current) {
                    return;
                }

                log.error('[useChatGroups] Failed to load conversation groups', caughtError);
                setGroupsError(caughtError);
            } finally {
                if (requestNumber === groupsRequestRef.current) {
                    setGroupsLoading(false);
                }
            }
        }

        void loadGroups();
    }, [active, groupsReloadTrigger]);

    const reloadGroups = useCallback(() => {
        setGroupsReloadTrigger(trigger => trigger + 1);
    }, []);

    const loadGroupPage = useCallback(async (chatGroupId, pageNumber) => {
        const paging = pagingStateFor(groupPagingRef.current, chatGroupId);
        const generation = paging.generation;

        paging.loading = true;
        paging.started = true;

        setChatsByGroupId(previousChats => ({
            ...previousChats,
            [chatGroupId]: {...(previousChats[chatGroupId] ?? emptyGroupChats()), loading: true},
        }));

        try {
            const page = await chatGroupService.findGroupChats(chatGroupId, {page: pageNumber});
            const currentPaging = pagingStateFor(groupPagingRef.current, chatGroupId);

            if (generation !== currentPaging.generation) {
                return;
            }

            currentPaging.loading = false;
            currentPaging.nextPage = page.page + 1;
            currentPaging.last = page.last;

            setChatsByGroupId(previousChats => {
                const existing = previousChats[chatGroupId] ?? emptyGroupChats();

                return {
                    ...previousChats,
                    [chatGroupId]: {
                        chats: pageNumber === 0 ? page.chats : appendUnseenChats(existing.chats, page.chats),
                        page: page.page,
                        last: page.last,
                        totalElements: page.totalElements,
                        loading: false,
                        error: null,
                    },
                };
            });
        } catch (caughtError) {
            const currentPaging = pagingStateFor(groupPagingRef.current, chatGroupId);

            if (generation !== currentPaging.generation) {
                return;
            }

            currentPaging.loading = false;

            /* Re-armed, so collapsing and expanding the group again retries rather than staying blank. */
            if (pageNumber === 0) {
                currentPaging.started = false;
            }

            log.error('[useChatGroups] Failed to load a page of group conversations', chatGroupId, pageNumber, caughtError);

            setChatsByGroupId(previousChats => ({
                ...previousChats,
                [chatGroupId]: {
                    ...(previousChats[chatGroupId] ?? emptyGroupChats()),
                    loading: false,
                    error: caughtError,
                },
            }));
        }
    }, []);

    /* First page only, and only once — re-expanding a group issues no second request. */
    const loadGroupChats = useCallback((chatGroupId) => {
        const paging = pagingStateFor(groupPagingRef.current, chatGroupId);

        if (paging.started || paging.loading) {
            return;
        }

        void loadGroupPage(chatGroupId, 0);
    }, [loadGroupPage]);

    const loadMoreGroupChats = useCallback((chatGroupId) => {
        const paging = pagingStateFor(groupPagingRef.current, chatGroupId);

        if (!paging.started || paging.loading || paging.last) {
            return;
        }

        void loadGroupPage(chatGroupId, paging.nextPage);
    }, [loadGroupPage]);

    /* Restarts one group from page 0, for a section the server has told us is out of date. */
    const reloadGroupChats = useCallback((chatGroupId) => {
        const paging = pagingStateFor(groupPagingRef.current, chatGroupId);

        paging.generation += 1;
        paging.loading = false;
        paging.nextPage = 0;
        paging.last = false;

        void loadGroupPage(chatGroupId, 0);
    }, [loadGroupPage]);

    const replaceGroupChat = useCallback((chatGroupId, updatedChat) => {
        setChatsByGroupId(previousChats => {
            const existing = previousChats[chatGroupId];

            if (!existing) {
                return previousChats;
            }

            const chats = existing.chats.map(
                chat => (chat.id === updatedChat.id ? {...chat, ...updatedChat} : chat)
            );

            return {...previousChats, [chatGroupId]: {...existing, chats}};
        });
    }, []);

    const removeGroupChat = useCallback((chatGroupId, chatId) => {
        setChatsByGroupId(previousChats => {
            const existing = previousChats[chatGroupId];

            if (!existing) {
                return previousChats;
            }

            const chats = existing.chats.filter(chat => chat.id !== chatId);

            if (chats.length === existing.chats.length) {
                return previousChats;
            }

            return {
                ...previousChats,
                [chatGroupId]: {...existing, chats, totalElements: adjustCount(existing.totalElements, -1)},
            };
        });
    }, []);

    /*
     * Files a conversation into a group that is already loaded. A group nobody has expanded has no
     * cached page to insert into and is left alone — silently fetching a collapsed group to keep a
     * number honest is not worth the request.
     *
     * The chat lands at the head of the *unplaced* part rather than at the head of the list: a chat
     * that just changed group has its `groupSortOrder` cleared, and the placed chats are a prefix
     * that a newly unplaced row must not jump in front of.
     */
    const addGroupChat = useCallback((chatGroupId, incomingChat) => {
        setChatsByGroupId(previousChats => {
            const existing = previousChats[chatGroupId];

            if (!existing || existing.chats.some(chat => chat.id === incomingChat.id)) {
                return previousChats;
            }

            const {placed, unplaced} = partitionPlacedChats(existing.chats, GROUP_ORDER_FIELD);

            return {
                ...previousChats,
                [chatGroupId]: {
                    ...existing,
                    chats: [...placed, incomingChat, ...unplaced],
                    totalElements: adjustCount(existing.totalElements, 1),
                },
            };
        });
    }, []);

    /*
     * Wholesale replacement of one group's rendered array, for an optimistic reorder and its
     * rollback.
     *
     * An updater is accepted as well as an array, because a reorder that follows a move into this
     * group has to be computed from the array *including* the conversation that was just added —
     * and the caller's render has not seen that insert yet.
     */
    const setGroupChatsDirectly = useCallback((chatGroupId, chatsOrUpdater) => {
        setChatsByGroupId(previousChats => {
            const existing = previousChats[chatGroupId];

            if (!existing) {
                return previousChats;
            }

            const chats = typeof chatsOrUpdater === "function"
                ? chatsOrUpdater(existing.chats)
                : chatsOrUpdater;

            return {...previousChats, [chatGroupId]: {...existing, chats}};
        });
    }, []);

    return {
        groups,
        groupsLoading,
        groupsError,
        reloadGroups,
        chatsByGroupId,
        loadGroupChats,
        loadMoreGroupChats,
        reloadGroupChats,
        replaceGroupChat,
        removeGroupChat,
        addGroupChat,
        setGroupChatsDirectly,
    };
}

function emptyGroupChats() {
    return {chats: [], page: null, last: false, totalElements: null, loading: false, error: null};
}

function pagingStateFor(pagingByGroupId, chatGroupId) {
    let paging = pagingByGroupId.get(chatGroupId);

    if (!paging) {
        paging = {loading: false, nextPage: 0, last: false, started: false, generation: 0};
        pagingByGroupId.set(chatGroupId, paging);
    }

    return paging;
}

/* A count that was never reported stays unknown; it is not invented from a local edit. */
function adjustCount(totalElements, delta) {
    if (!Number.isInteger(totalElements)) {
        return totalElements;
    }

    return Math.max(0, totalElements + delta);
}

/*
 * A conversation filed into this group while the drawer is open shifts every row down a page, which
 * would otherwise re-deliver rows already on screen and duplicate React keys.
 */
function appendUnseenChats(existingChats, incomingChats) {
    const knownChatIds = new Set(existingChats.map(chat => chat.id));

    return [...existingChats, ...incomingChats.filter(chat => !knownChatIds.has(chat.id))];
}

export default useChatGroups;
