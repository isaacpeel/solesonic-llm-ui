import {useCallback, useEffect, useRef, useState} from "react";
import log from "loglevel";

const defaultItemKey = (item) => item.id;

/*
 * Each load is stamped with a generation, so a response that arrives after the identity moved on
 * (or after unmount) is dropped rather than mixed into the new list. Appended pages skip items
 * already present, because a local edit or delete shifts the server's offsets.
 */
const usePagedList = (fetchPage, identity, itemKey = defaultItemKey) => {
    const [items, setItems] = useState([]);
    const [loadedPages, setLoadedPages] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [loadedIdentity, setLoadedIdentity] = useState(identity);
    const [reloadCount, setReloadCount] = useState(0);

    const fetchPageRef = useRef(fetchPage);
    const generationRef = useRef(0);
    const loadingMoreRef = useRef(false);
    const sentinelRef = useRef(null);

    if (loadedIdentity !== identity) {
        setLoadedIdentity(identity);
        setItems([]);
        setLoadedPages(0);
        setTotalPages(0);
        setLoadError(null);
        setLoadingMore(false);
    }

    useEffect(() => {
        fetchPageRef.current = fetchPage;
    }, [fetchPage]);

    useEffect(() => {
        generationRef.current += 1;
        loadingMoreRef.current = false;
        const generation = generationRef.current;

        fetchPageRef.current(0)
            .then((paged) => {
                if (generation !== generationRef.current) {
                    return;
                }

                setItems(paged?.content ?? []);
                setTotalPages(paged?.page?.totalPages ?? 0);
                setLoadedPages(1);
                setLoadError(null);
            })
            .catch((caughtError) => {
                if (generation !== generationRef.current) {
                    return;
                }

                log.error('[usePagedList] Failed to load the first page', caughtError);
                setLoadError(caughtError);
            });

        return () => {
            generationRef.current += 1;
        };
    }, [identity, reloadCount]);

    const hasMore = loadedPages > 0 && loadedPages < totalPages;

    const loadNextPage = useCallback(async () => {
        if (loadingMoreRef.current || loadedPages === 0 || loadedPages >= totalPages) {
            return;
        }

        const generation = generationRef.current;
        loadingMoreRef.current = true;
        setLoadingMore(true);

        try {
            const paged = await fetchPageRef.current(loadedPages);

            if (generation !== generationRef.current) {
                return;
            }

            setItems((currentItems) => {
                const loadedKeys = new Set(currentItems.map(itemKey));
                const freshItems = (paged?.content ?? []).filter((item) => !loadedKeys.has(itemKey(item)));

                return [...currentItems, ...freshItems];
            });
            setTotalPages(paged?.page?.totalPages ?? 0);
            setLoadedPages((currentLoadedPages) => currentLoadedPages + 1);
            setLoadError(null);
        } catch (caughtError) {
            if (generation !== generationRef.current) {
                return;
            }

            log.error('[usePagedList] Failed to load the next page', caughtError);
            setLoadError(caughtError);
        } finally {
            if (generation === generationRef.current) {
                loadingMoreRef.current = false;
                setLoadingMore(false);
            }
        }
    }, [loadedPages, totalPages, itemKey]);

    useEffect(() => {
        const sentinel = sentinelRef.current;

        if (!sentinel || !hasMore || typeof IntersectionObserver === "undefined") {
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                void loadNextPage();
            }
        });

        observer.observe(sentinel);

        return () => observer.disconnect();
    }, [hasMore, loadNextPage]);

    const reload = useCallback(() => {
        setReloadCount((currentCount) => currentCount + 1);
    }, []);

    return {
        items,
        setItems,
        loaded: loadedPages > 0,
        hasMore,
        loadingMore,
        loadError,
        sentinelRef,
        loadNextPage,
        reload,
    };
};

export default usePagedList;
