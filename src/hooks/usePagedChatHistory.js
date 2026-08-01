import {useCallback, useEffect, useRef, useState} from 'react';
import log from 'loglevel';
import chatService, {DEFAULT_CHAT_HISTORY_PAGE_SIZE} from '../service/ChatService.js';

/*
 * Pages the sidebar's chat list off the Spring `Pageable` endpoint. Only the pages the user has
 * actually scrolled to are fetched; the accumulated rows live here so the drawer can be re-opened
 * without discarding what was already loaded.
 */
function usePagedChatHistory({active, reloadTrigger, userId, pageSize = DEFAULT_CHAT_HISTORY_PAGE_SIZE}) {
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [hasMore, setHasMore] = useState(true);

    /*
     * Bumped whenever paging restarts, so a response from a superseded run is dropped instead of
     * being appended onto the fresh list.
     */
    const requestGenerationRef = useRef(0);

    /*
     * Mirrors of the paging state, read by `loadMore`. The scroll sentinel can fire several times
     * before React re-renders, and a stale closure over `loading`/`hasMore` would let those extra
     * firings request the same page again.
     */
    const loadingRef = useRef(false);
    const nextPageRef = useRef(0);
    const hasMoreRef = useRef(true);

    const loadPage = useCallback(async (pageNumber, generation) => {
        loadingRef.current = true;
        setLoading(true);

        try {
            const page = await chatService.findChatHistory({page: pageNumber, size: pageSize});

            if (generation !== requestGenerationRef.current) {
                return;
            }

            setChats(previousChats => (
                pageNumber === 0 ? page.chats : appendUnseenChats(previousChats, page.chats)
            ));

            nextPageRef.current = page.page + 1;
            hasMoreRef.current = !page.last;
            setHasMore(hasMoreRef.current);
            setError(null);
        } catch (caughtError) {
            if (generation !== requestGenerationRef.current) {
                return;
            }

            log.error('[usePagedChatHistory] Failed to load chat history page', pageNumber, caughtError);
            setError(caughtError);

            /* Park paging so the sentinel does not re-request the failing page on every scroll tick. */
            hasMoreRef.current = false;
            setHasMore(false);
        } finally {
            if (generation === requestGenerationRef.current) {
                loadingRef.current = false;
                setLoading(false);
            }
        }
    }, [pageSize]);

    /*
     * Restart from page 0 when the drawer opens or the list is invalidated. The existing rows are
     * left on screen until the new first page lands — page 0 replaces them wholesale — so
     * re-opening the drawer does not flash an empty list.
     */
    useEffect(() => {
        if (!active) {
            return;
        }

        requestGenerationRef.current += 1;
        nextPageRef.current = 0;
        hasMoreRef.current = true;
        loadingRef.current = false;
        setHasMore(true);
        setError(null);

        void loadPage(0, requestGenerationRef.current);
    }, [active, reloadTrigger, userId, loadPage]);

    const loadMore = useCallback(() => {
        if (loadingRef.current || !hasMoreRef.current) {
            return;
        }

        void loadPage(nextPageRef.current, requestGenerationRef.current);
    }, [loadPage]);

    /* Re-arms paging after a failure, retrying the page that failed rather than starting over. */
    const retry = useCallback(() => {
        if (loadingRef.current) {
            return;
        }

        hasMoreRef.current = true;
        setHasMore(true);
        setError(null);

        void loadPage(nextPageRef.current, requestGenerationRef.current);
    }, [loadPage]);

    return {chats, loading, error, hasMore, loadMore, retry};
}

/*
 * A chat started while the drawer is open shifts every row down a page, which would otherwise
 * re-deliver rows already on screen and duplicate React keys.
 */
function appendUnseenChats(existingChats, incomingChats) {
    const knownChatIds = new Set(existingChats.map(chat => chat.id));

    return [...existingChats, ...incomingChats.filter(chat => !knownChatIds.has(chat.id))];
}

export default usePagedChatHistory;
