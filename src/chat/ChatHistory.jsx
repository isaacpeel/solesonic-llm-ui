import {useEffect, useMemo, useRef} from "react";
import {useNavigate} from "react-router";
import {useVirtualizer} from "@tanstack/react-virtual";

import "./ChatHistory.css";
import {useSharedData} from "../context/useSharedData.jsx";
import usePagedChatHistory from "../hooks/usePagedChatHistory.js";
import {groupChatsByDay} from "../util/chatHistoryGrouping.js";
import {
    CHAT_HISTORY_HEADER_ROW,
    estimateChatHistoryRowSize,
    flattenChatGroupsToRows,
} from "../util/chatHistoryRows.js";

/* Rows kept mounted above and below the window, so a fast flick does not expose blank space. */
const OVERSCAN_ROWS = 4;

/* Starts the next fetch while the tail is still below the fold, so scrolling stays smooth. */
const LOAD_MORE_ROW_THRESHOLD = 5;

/*
 * Seeds the virtualizer before the first ResizeObserver callback. `.drawer` is a fixed 250px column
 * spanning the viewport, so this is the real geometry rather than a placeholder — without it the
 * first paint windows against a zero-height box and mounts a single row.
 */
const INITIAL_SCROLL_RECT = {width: 250, height: 600};

function ChatHistory({userId, drawerOpen, setDrawerOpen}) {
    const {reloadHistoryTrigger, setChatId, chatInputRef} = useSharedData();
    const navigate = useNavigate();

    const drawerRef = useRef(null);
    const scrollContainerRef = useRef(null);

    const {chats, loading, error, hasMore, loadMore, retry} = usePagedChatHistory({
        active: drawerOpen,
        reloadTrigger: reloadHistoryTrigger,
        userId,
    });

    /*
     * Both are memoized on the accumulated pages rather than recomputed per render: grouping sorts
     * every bucket and then the buckets themselves, and the drawer re-renders on every parent
     * state change, not just when a page lands.
     */
    const groupedChats = useMemo(() => groupChatsByDay(chats), [chats]);
    const rows = useMemo(() => flattenChatGroupsToRows(groupedChats), [groupedChats]);

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollContainerRef.current,
        estimateSize: (index) => estimateChatHistoryRowSize(rows[index]),
        /* Keyed by chat id, so measurements survive a page append shifting every index. */
        getItemKey: (index) => rows[index]?.key ?? index,
        overscan: OVERSCAN_ROWS,
        initialRect: INITIAL_SCROLL_RECT,
    });

    const virtualRows = rowVirtualizer.getVirtualItems();

    /* Close on a click outside the drawer. Subscribed only while open, so the rest of the app is
     * not paying for a document-level listener the drawer cannot act on. */
    useEffect(() => {
        if (!drawerOpen) {
            return;
        }

        function handleClickOutside(event) {
            if (drawerRef.current && !drawerRef.current.contains(event.target)) {
                setDrawerOpen(false);
            }
        }

        document.addEventListener("mouseup", handleClickOutside);
        return () => {
            document.removeEventListener("mouseup", handleClickOutside);
        };
    }, [drawerOpen, setDrawerOpen]);

    /*
     * Infinite scroll: the virtualizer already knows how close the window is to the end of the
     * list, so nearing the last row pulls the next page. Re-running as rows arrive means a page
     * too short to fill the drawer immediately asks for the following one. Repeat calls are
     * harmless — `usePagedChatHistory` drops them while a request is in flight.
     */
    useEffect(() => {
        if (!drawerOpen || !hasMore) {
            return;
        }

        const lastVirtualRow = virtualRows[virtualRows.length - 1];

        if (lastVirtualRow && lastVirtualRow.index >= rows.length - LOAD_MORE_ROW_THRESHOLD) {
            loadMore();
        }
    }, [drawerOpen, hasMore, loadMore, rows.length, virtualRows]);

    const handleChatClick = (chatId) => {
        setChatId(chatId);
        setDrawerOpen(false);

        /*
         * The drawer is in the header, so a chat can be picked from any route. Without the
         * navigate the id changes behind a page that cannot render it, and the input ref is
         * null whenever ChatScreen is not mounted.
         */
        navigate("/");
        chatInputRef.current?.focus();
    };

    return (
        <div ref={drawerRef} className="chat-drawer-container bg-primary">
            <div className="chat-drawer mt-7!">
                <h2>Chat History</h2>
                <div className="chat-history-scroll" ref={scrollContainerRef}>
                    <div
                        className="chat-history-spacer"
                        style={{height: `${rowVirtualizer.getTotalSize()}px`}}
                    >
                        {virtualRows.map((virtualRow) => {
                            const row = rows[virtualRow.index];

                            if (!row) {
                                return null;
                            }

                            return (
                                <div
                                    key={virtualRow.key}
                                    /* measureElement reads this to know which row it measured. */
                                    data-index={virtualRow.index}
                                    ref={rowVirtualizer.measureElement}
                                    className={rowClassName(row)}
                                    style={{transform: `translateY(${virtualRow.start}px)`}}
                                >
                                    {row.type === CHAT_HISTORY_HEADER_ROW ? (
                                        <div className="date-header">{row.label}</div>
                                    ) : (
                                        <div
                                            className="chat-item"
                                            onClick={() => handleChatClick(row.chatId)}
                                        >
                                            {row.label}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* In the scroll box, not the footer: an empty list stands in for the rows
                      * under the title rather than sitting pinned to the drawer's foot. It can
                      * never coexist with a scrollbar, so it cannot disturb one. */}
                    {!loading && !error && chats.length === 0 && (
                        <div className="chat-history-status">No chats yet.</div>
                    )}
                </div>

                {/*
                  * Paging feedback overlaid on the foot of the scroll box. It takes no layout
                  * height, so the list runs to the bottom of the drawer and the scroll viewport
                  * never changes size as statuses toggle — and the retry button is always
                  * reachable without scrolling to the end of the list.
                  */}
                <div className="chat-history-status-area">
                    {loading && (
                        <div className="chat-history-status">Loading…</div>
                    )}

                    {!loading && error && (
                        <div className="chat-history-status chat-history-error">
                            <span>Could not load chat history.</span>
                            <button type="button" className="chat-history-retry" onClick={retry}>
                                Retry
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function rowClassName(row) {
    if (row.type !== CHAT_HISTORY_HEADER_ROW) {
        return "chat-history-row";
    }

    if (row.firstInList) {
        return "chat-history-row chat-history-header-row";
    }

    return "chat-history-row chat-history-header-row chat-history-header-row-spaced";
}

export default ChatHistory;
