import {useEffect, useMemo, useRef, useState} from "react";
import {useNavigate} from "react-router";
import {useVirtualizer} from "@tanstack/react-virtual";
import {toast} from "react-toastify";
import log from "loglevel";

import "./ChatHistory.css";
import ChatRowMenu, {CHAT_HISTORY_PORTAL_ATTRIBUTE} from "./ChatRowMenu.jsx";
import {useSharedData} from "../context/useSharedData.jsx";
import usePagedChatHistory from "../hooks/usePagedChatHistory.js";
import chatService from "../service/ChatService.js";
import {groupChatsByDay} from "../util/chatHistoryGrouping.js";
import {
    CHAT_HISTORY_HEADER_ROW,
    chatHistoryRowLabel,
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

    const {chats, loading, error, hasMore, loadMore, retry, replaceChat, removeChat} = usePagedChatHistory({
        active: drawerOpen,
        reloadTrigger: reloadHistoryTrigger,
        userId,
    });

    /*
     * The row being renamed is tracked here rather than in the row: rows are virtualized, so the
     * one being edited can be unmounted by a scroll and would take its state with it. `attempt`
     * remounts the editor when it is re-opened on the same chat after a rejected name, so the
     * seeded text is the one the user actually tried.
     */
    const [renamingChatId, setRenamingChatId] = useState(null);
    const [renameSeed, setRenameSeed] = useState({value: "", attempt: 0});

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
            /*
             * A row's action menu is portalled to document.body, so it is outside drawerRef even
             * though it belongs to the drawer. Without this, clicking a menu item would close the
             * drawer on mouseup and the click would never reach the item.
             */
            if (event.target?.closest?.(`[${CHAT_HISTORY_PORTAL_ATTRIBUTE}]`)) {
                return;
            }

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
        /* A row being renamed is an editor, not a link — clicking its padding must not navigate. */
        if (chatId === renamingChatId) {
            return;
        }

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

    /*
     * Seeded with the stored name only. The first-message label is a display convenience, not a
     * name — pre-filling the field with it would turn "give this chat a name" into "edit this
     * message", and committing unchanged would save a name the user never wrote.
     */
    const handleRenameStart = (chat) => {
        setRenameSeed(previousSeed => ({value: chat?.name ?? "", attempt: previousSeed.attempt + 1}));
        setRenamingChatId(chat.id);
    };

    const handleRenameCancel = () => {
        setRenamingChatId(null);
    };

    const handleRenameCommit = async (chatId, name) => {
        const trimmedName = name.trim();
        const existingChat = chats.find(chat => chat.id === chatId);

        /* Cleared and committed means "never mind", and the server would reject a blank name anyway. */
        if (trimmedName === "" || trimmedName === (existingChat?.name ?? "")) {
            setRenamingChatId(null);
            return;
        }

        /* Optimistic: the row label changing is the confirmation, so it must not wait on the round trip. */
        replaceChat({...existingChat, name: trimmedName});
        setRenamingChatId(null);

        try {
            const renamedChat = await chatService.renameChat(chatId, trimmedName);
            replaceChat(renamedChat);
        } catch (caughtError) {
            log.error('[ChatHistory] Rename failed', chatId, caughtError);
            replaceChat(existingChat);

            if (caughtError.status === 404) {
                removeChat(chatId);
                toast.error('That conversation no longer exists.');
                return;
            }

            if (caughtError.status === 400) {
                toast.error('That name could not be saved. Names must be 1–255 characters.');
                setRenameSeed(previousSeed => ({value: trimmedName, attempt: previousSeed.attempt + 1}));
                setRenamingChatId(chatId);
                return;
            }

            toast.error('Could not rename the conversation. Please try again.');
        }
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
                                            title={row.fullLabel}
                                            onClick={() => handleChatClick(row.chatId)}
                                        >
                                            {row.chatId === renamingChatId ? (
                                                <ChatItemRenameInput
                                                    key={`${row.chatId}:${renameSeed.attempt}`}
                                                    initialValue={renameSeed.value}
                                                    placeholder={chatHistoryRowLabel({...row.chat, name: null})}
                                                    onCommit={(name) => handleRenameCommit(row.chatId, name)}
                                                    onCancel={handleRenameCancel}
                                                />
                                            ) : (
                                                <>
                                                    <span className="chat-item-label">{row.label}</span>
                                                    <ChatRowMenu
                                                        label={row.fullLabel}
                                                        actions={[{
                                                            key: "rename",
                                                            label: "Rename",
                                                            onSelect: () => handleRenameStart(row.chat),
                                                        }]}
                                                    />
                                                </>
                                            )}
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

/* Matches the server's column limit, so a name long enough to be rejected cannot be typed. */
const MAXIMUM_CHAT_NAME_LENGTH = 255;

/**
 * The rename editor, in place of the row's label.
 *
 * It replaces the label rather than sitting beside or below it: the virtualizer measured this row
 * as one line, and a second line here would invalidate the position of every row under it.
 *
 * The draft lives here and the committed value is handed up, so a keystroke re-renders one input
 * rather than the whole windowed list. `commit` is one-shot because Enter closes the editor and
 * the blur that follows would otherwise submit the same name a second time.
 *
 * @param {{
 *   initialValue: string,
 *   placeholder: string,
 *   onCommit: (name: string) => void,
 *   onCancel: () => void,
 * }} props
 */
function ChatItemRenameInput({initialValue, placeholder, onCommit, onCancel}) {
    const [draftName, setDraftName] = useState(initialValue);
    const inputRef = useRef(null);
    const committedRef = useRef(false);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const commit = () => {
        if (committedRef.current) {
            return;
        }

        committedRef.current = true;
        onCommit(draftName);
    };

    const handleKeyDown = (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            commit();
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            /* The drawer is listening above this row; cancelling an edit is not a drawer gesture. */
            event.stopPropagation();
            committedRef.current = true;
            onCancel();
        }
    };

    return (
        <input
            ref={inputRef}
            type="text"
            className="chat-item-rename"
            aria-label="Conversation name"
            value={draftName}
            placeholder={placeholder}
            maxLength={MAXIMUM_CHAT_NAME_LENGTH}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commit}
            /* `.chat-item` opens the chat; clicking into the field being edited must not. */
            onClick={(event) => event.stopPropagation()}
        />
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
