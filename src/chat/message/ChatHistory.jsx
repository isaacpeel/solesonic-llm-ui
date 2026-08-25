import {useEffect, useMemo, useRef, useState} from "react";
import {useNavigate} from "react-router";
import {useVirtualizer} from "@tanstack/react-virtual";
import {ChevronRightIcon} from "@heroicons/react/24/solid";
import {MdDragIndicator} from "react-icons/md";
import {toast} from "react-toastify";
import log from "loglevel";

import "./ChatHistory.css";
import ChatRowMenu, {CHAT_HISTORY_PORTAL_ATTRIBUTE} from "./ChatRowMenu.jsx";
import ChatDropActionMenu from "./ChatDropActionMenu.jsx";
import ChatGroupDialogs from "./ChatGroupDialogs.jsx";
import ChatGroupSection, {isChatGroupRow} from "./ChatGroupSection.jsx";
import ChatNameInput from "./ChatNameInput.jsx";
import DeleteChatDialog from "./DeleteChatDialog.jsx";
import {useSharedData} from "../../context/useSharedData.jsx";
import usePagedChatHistory from "../../hooks/usePagedChatHistory.js";
import useChatGroupSections from "../../hooks/useChatGroupSections.js";
import chatService from "../../service/ChatService.js";
import {groupChatsByDay, partitionGroupedChats} from "../../util/chatHistoryGrouping.js";
import {
    CHAT_HISTORY_HEADER_ROW,
    chatFromRow,
    chatHistoryRowFullLabel,
    chatHistoryRowLabel,
    estimateChatHistoryRowSize,
    flattenChatGroupsToRows,
} from "../../util/chatHistoryRows.js";
import {
    DROP_AFTER,
    DROP_BEFORE,
    DROP_ONTO,
    NEW_GROUP_DROP_ATTRIBUTE,
} from "../../util/chatHistoryDrag.js";
import useChatHistoryDrag from "../../hooks/useChatHistoryDrag.js";

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

/* Rendered as the disabled item's title, so the user learns why rather than just being blocked. */
const STREAMING_DELETE_REASON = "Wait for the response to finish.";

/*
 * Ceiling on the top-up below. A user whose entire history is filed under groups would otherwise
 * walk every page of it the moment the drawer opens.
 */
const MAXIMUM_CONSECUTIVE_EMPTY_PAGES = 10;

const DRAG_HANDLE_HINT = "Drag onto a group, or out of the drawer";

const GROUPED_DRAG_HANDLE_HINT = "Drag to reorder, or use the arrow keys";

function ChatHistory({userId, drawerOpen, setDrawerOpen}) {
    const {
        reloadHistoryTrigger,
        chatId: openChatId,
        setChatId,
        setChatHistory,
        streamingChatId,
        chatInputRef,
        setReloadHistoryTrigger,
    } = useSharedData();
    const navigate = useNavigate();

    const drawerRef = useRef(null);
    const scrollContainerRef = useRef(null);

    const {
        chats,
        loading,
        error,
        hasMore,
        loadMore,
        retry,
        replaceChat,
        removeChat,
        upsertChat,
    } = usePagedChatHistory({
        active: drawerOpen,
        reloadTrigger: reloadHistoryTrigger,
        userId,
    });

    /*
     * Leaving the transcript of a deleted conversation on screen is the worst outcome available:
     * the next message would PUT to a chat id the server no longer has. Same sequence, in the same
     * order, as Header#handleNewChat.
     */
    const closeDeletedTranscripts = (deletedChatIds) => {
        if (!openChatId || !deletedChatIds.includes(openChatId)) {
            return;
        }

        setChatHistory([]);
        setChatId(null);
        navigate("/");
    };

    const chatGroups = useChatGroupSections({
        active: drawerOpen,
        replaceChat,
        upsertChat,
        removeChat,
        onChatsDeleted: closeDeletedTranscripts,
        onReloadHistory: () => setReloadHistoryTrigger(trigger => trigger + 1),
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
     * The same pair for a group section header. A group is renamed in place, the way a conversation
     * is — the drawer has one idiom for renaming, not a row editor here and a dialog there.
     */
    const [renamingChatGroupId, setRenamingChatGroupId] = useState(null);
    const [groupRenameSeed, setGroupRenameSeed] = useState({value: "", attempt: 0});

    /*
     * null when closed; carries the row so the dialog can name the conversation and so the drawer
     * knows which group's cached page the row also has to come out of.
     */
    const [deleteRequest, setDeleteRequest] = useState(null);

    /* null when closed; `{chat, point}` for a conversation released clear of the drawer. */
    const [dropActionRequest, setDropActionRequest] = useState(null);

    const [emptyPageAttempts, setEmptyPageAttempts] = useState(0);

    /*
     * The day buckets the user has closed, held the other way round from a conversation group's
     * expanded set: a group starts collapsed because expanding it is what fetches its page, while a
     * day bucket holds conversations that are already here and is open until it is closed. Keyed by
     * day rather than by index, so a page landing above a closed section leaves it closed. Not
     * persisted, for the same reason a group's state is not.
     */
    const [collapsedDayKeys, setCollapsedDayKeys] = useState(() => new Set());

    /*
     * Memoized on the accumulated pages rather than recomputed per render: grouping sorts every
     * bucket and then the buckets themselves, and the drawer re-renders on every parent state
     * change, not just when a page lands.
     */
    const {ungrouped} = useMemo(() => partitionGroupedChats(chats), [chats]);

    /*
     * The ungrouped list is a timeline and nothing else — day-bucketed, newest first, with no
     * hand-made arrangement laid over it. A conversation's place here is its date, so there is
     * nothing for a drag to rearrange; ordering belongs to groups, where the server has a column
     * for it and the rendered list can express a position. `sortOrder` is deliberately not read.
     */
    const dayGroups = useMemo(() => groupChatsByDay(ungrouped), [ungrouped]);

    const daySections = useMemo(
        () => dayGroups.map(dayGroup => ({...dayGroup, expanded: !collapsedDayKeys.has(dayGroup.key)})),
        [dayGroups, collapsedDayKeys],
    );

    const chatGroupSections = chatGroups.chatGroupSections;

    const rows = useMemo(
        () => flattenChatGroupsToRows([...chatGroupSections, ...daySections]),
        [chatGroupSections, daySections],
    );

    const ungroupedChatCount = ungrouped.length;

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

    /* Paging restarts with the drawer, and so does the top-up budget below. */
    useEffect(() => {
        setEmptyPageAttempts(0);
    }, [drawerOpen, reloadHistoryTrigger]);

    /*
     * Top-up for the ungrouped list.
     *
     * The server's page counters count grouped conversations too, so a page of twenty can contribute
     * nothing at all to this list once `partitionGroupedChats` has had it. The scroll sentinel above
     * only fires from rows near the end of the window, so a page that adds no rows would leave paging
     * stalled with `hasMore` still true. This asks for the next one until the list actually grows or
     * the server reports the last page.
     *
     * The counter is state rather than a ref on purpose: landing on another empty page has to re-run
     * this effect, and a ref would not.
     */
    useEffect(() => {
        if (!drawerOpen || !hasMore || loading) {
            return;
        }

        if (ungroupedChatCount > 0) {
            if (emptyPageAttempts !== 0) {
                setEmptyPageAttempts(0);
            }

            return;
        }

        if (emptyPageAttempts >= MAXIMUM_CONSECUTIVE_EMPTY_PAGES) {
            return;
        }

        setEmptyPageAttempts(attempts => attempts + 1);
        loadMore();
    }, [drawerOpen, hasMore, loading, ungroupedChatCount, emptyPageAttempts, loadMore]);

    const toggleDaySection = (dayKey) => {
        setCollapsedDayKeys(previousKeys => {
            const nextKeys = new Set([...previousKeys]);

            if (nextKeys.has(dayKey)) {
                nextKeys.delete(dayKey);
            } else {
                nextKeys.add(dayKey);
            }

            return nextKeys;
        });
    };

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

    /*
     * A rename has to land on both copies of the conversation. A row inside a group section came
     * from that group's own endpoint and may never have been on a page the ungrouped list holds, so
     * `replaceChat` alone would leave the label the user just edited unchanged.
     */
    const applyRenamedChat = (chat, chatGroupId) => {
        replaceChat(chat);

        if (chatGroupId) {
            chatGroups.replaceGroupChat(chatGroupId, chat);
        }
    };

    const handleRenameCommit = async (row, name) => {
        const trimmedName = name.trim();
        const chatId = row.chatId;
        const chatGroupId = row.chatGroupId ?? null;

        /* The row carries the conversation itself, which is the only copy of one inside a group. */
        const existingChat = row.chat;

        /* Cleared and committed means "never mind", and the server would reject a blank name anyway. */
        if (trimmedName === "" || trimmedName === (existingChat?.name ?? "")) {
            setRenamingChatId(null);
            return;
        }

        /* Optimistic: the row label changing is the confirmation, so it must not wait on the round trip. */
        applyRenamedChat({...existingChat, name: trimmedName}, chatGroupId);
        setRenamingChatId(null);

        try {
            const renamedChat = await chatService.renameChat(chatId, trimmedName);
            applyRenamedChat(renamedChat, chatGroupId);
        } catch (caughtError) {
            log.error('[ChatHistory] Rename failed', chatId, caughtError);
            applyRenamedChat(existingChat, chatGroupId);

            if (caughtError.status === 404) {
                removeChat(chatId);

                if (chatGroupId) {
                    chatGroups.removeGroupChat(chatGroupId, chatId);
                }

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

    /*
     * Seeded with the group's stored name, which for a group is the whole of its label — unlike a
     * conversation there is no first-message stand-in to be careful about.
     */
    const handleGroupRenameStart = (row) => {
        setGroupRenameSeed(previousSeed => ({value: row.fullLabel, attempt: previousSeed.attempt + 1}));
        setRenamingChatGroupId(row.chatGroupId);
    };

    const handleGroupRenameCancel = () => {
        setRenamingChatGroupId(null);
    };

    /*
     * The request and the optimistic redraw live in `useChatGroupSections`, which owns the group
     * list; the editor is this drawer's. A name the server refused reopens it on what was typed,
     * the same way a rejected conversation name does.
     */
    const handleGroupRenameCommit = async (row, name) => {
        const chatGroupId = row.chatGroupId;

        setRenamingChatGroupId(null);

        const settled = await chatGroups.handleRenameGroup(chatGroupId, name);

        if (!settled) {
            setGroupRenameSeed(previousSeed => ({value: name.trim(), attempt: previousSeed.attempt + 1}));
            setRenamingChatGroupId(chatGroupId);
        }
    };

    /*
     * The whole gesture, from the press on a grip to the release. Two of its targets are not rows:
     * the `+ New group` button, and everything outside the drawer — which offers to delete the
     * conversation or to build a group around it.
     */
    const {
        draggedChat,
        draggedChatGroupId,
        dropTarget,
        newGroupDropActive,
        outsideDropActive,
        dragHandleProps,
        groupDragHandleProps,
    } = useChatHistoryDrag({
        rows,
        scrollContainerRef,
        drawerRef,
        placedChatsFor: chatGroups.placedChatsFor,
        orderedGroups: chatGroups.orderedGroups,
        onDrop: (chat, destination) => {
            void chatGroups.handleChatDrop(chat, destination);
        },
        onGroupDrop: (chatGroupId, position) => {
            void chatGroups.handleGroupDrop(chatGroupId, position);
        },
        onNewGroup: (chat) => chatGroups.requestCreateGroup(chat),
        onDropOutside: (chat, point) => setDropActionRequest({chat, point}),
    });

    /*
     * A group travels as a whole section, so its conversations are lifted with its header rather
     * than left looking anchored while the thing they belong to moves.
     */
    const isRowDragging = (row) => {
        if (draggedChat) {
            return draggedChat.id === row.chatId;
        }

        return !!draggedChatGroupId && row.chatGroupId === draggedChatGroupId;
    };

    /*
     * The row is dropped from both lists: a conversation rendered inside a group came from that
     * group's own endpoint and may never have been on a page the ungrouped list holds.
     *
     * Reached on a 404 as well as on a 204 — a repeated delete answers 404, and the conversation
     * being absent is the outcome the user asked for either way.
     */
    const handleChatDeleted = (deletedChatId) => {
        const chatGroupId = deleteRequest?.chatGroupId ?? null;

        removeChat(deletedChatId);

        if (chatGroupId) {
            chatGroups.removeGroupChat(chatGroupId, deletedChatId);
        }

        setDeleteRequest(null);
        toast('Conversation deleted');

        closeDeletedTranscripts([deletedChatId]);
    };

    /*
     * The one item in this menu that is disabled rather than omitted. Everything else that does not
     * apply is simply absent, but a conversation that is mid-turn is one the user has every reason
     * to expect they can delete — they need the reason, not a missing row.
     */
    const buildDeleteAction = (row) => {
        const streaming = !!streamingChatId && row.chatId === streamingChatId;

        return {
            key: "delete",
            label: "Delete",
            destructive: true,
            separatorBefore: true,
            disabled: streaming,
            disabledReason: STREAMING_DELETE_REASON,
            onSelect: () => setDeleteRequest({
                chatId: row.chatId,
                chatGroupId: row.chatGroupId ?? null,
                label: row.fullLabel,
            }),
        };
    };

    /*
     * Two items, and no arranging among them. Filing, unfiling and ordering are all drag gestures
     * now — an action that duplicates a gesture is a second place for the two to disagree.
     */
    const buildRowActions = (row) => ([
        {
            key: "rename",
            label: "Rename",
            onSelect: () => handleRenameStart(row.chat),
        },
        buildDeleteAction(row),
    ]);

    /*
     * Every row type shares one absolutely-positioned wrapper, so nothing here may wrap onto a
     * second line or change height on hover — the virtualizer placed every row below it against the
     * height this one measured. The drag handle and the drop indicators are sized and painted with
     * that in mind: the handle is shorter than the row's line box, and an indicator is a pseudo
     * element rather than a border.
     */
    const renderRow = (row) => {
        if (row.type === CHAT_HISTORY_HEADER_ROW) {
            return (
                <button
                    type="button"
                    className="date-header"
                    aria-expanded={row.expanded}
                    onClick={() => toggleDaySection(row.dayKey)}
                >
                    <ChevronRightIcon
                        aria-hidden="true"
                        className={row.expanded
                            ? "date-header-chevron date-header-chevron-expanded"
                            : "date-header-chevron"}
                    />

                    <span className="date-header-label">{row.label}</span>
                </button>
            );
        }

        if (isChatGroupRow(row)) {
            return (
                <ChatGroupSection
                    row={row}
                    onToggle={chatGroups.toggleChatGroup}
                    onLoadMore={chatGroups.loadMoreGroupChats}
                    onRenameGroup={handleGroupRenameStart}
                    onDeleteGroup={chatGroups.requestDeleteGroup}
                    renaming={row.chatGroupId === renamingChatGroupId}
                    renameSeed={groupRenameSeed}
                    onRenameCommit={handleGroupRenameCommit}
                    onRenameCancel={handleGroupRenameCancel}
                    dragHandleProps={groupDragHandleProps}
                    onDragHandleKeyDown={chatGroups.handleGroupDragHandleKeyDown}
                />
            );
        }

        return (
            <div
                className={row.chatGroupId ? "chat-item chat-item-in-group" : "chat-item"}
                title={row.fullLabel}
                onClick={() => handleChatClick(row.chatId)}
            >
                {row.chatId === renamingChatId ? (
                    <ChatNameInput
                        key={`${row.chatId}:${renameSeed.attempt}`}
                        className="chat-item-rename"
                        label="Conversation name"
                        initialValue={renameSeed.value}
                        placeholder={chatHistoryRowLabel({...row.chat, name: null})}
                        onCommit={(name) => handleRenameCommit(row, name)}
                        onCancel={handleRenameCancel}
                    />
                ) : (
                    <>
                        <button
                            type="button"
                            className="chat-history-drag-handle"
                            /* Outside a group the grip files and unfiles; it does not reorder. */
                            aria-label={row.chatGroupId
                                ? `Reorder ${row.fullLabel}`
                                : `Move ${row.fullLabel}`}
                            title={row.chatGroupId ? GROUPED_DRAG_HANDLE_HINT : DRAG_HANDLE_HINT}
                            /* `.chat-item` opens the chat; grabbing its handle must not. */
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => chatGroups.handleDragHandleKeyDown(event, row)}
                            {...dragHandleProps(chatFromRow(row))}
                        >
                            <MdDragIndicator aria-hidden="true"/>
                        </button>

                        <span className="chat-item-label">{row.label}</span>
                        <ChatRowMenu label={row.fullLabel} actions={buildRowActions(row)}/>
                    </>
                )}
            </div>
        );
    };

    return (
        <div ref={drawerRef} className="chat-drawer-container bg-primary">
            {/* Dimmed while the pointer is outside during a drag, so leaving the drawer reads as a
              * deliberate destination rather than the drag silently going nowhere. */}
            <div className={outsideDropActive ? "chat-drawer mt-7! chat-drawer-releasing" : "chat-drawer mt-7!"}>
                <h2>Chat History</h2>

                {/* Pinned under the title and outside the scroll box: anything that scrolls above
                  * the virtualizer's rows offsets every one of them. Also the target for a
                  * conversation dragged onto it, which creates the group around it. */}
                <button
                    type="button"
                    className={newGroupDropActive
                        ? "chat-history-new-group chat-history-new-group-drop-active"
                        : "chat-history-new-group"}
                    onClick={() => chatGroups.requestCreateGroup()}
                    {...{[NEW_GROUP_DROP_ATTRIBUTE]: "true"}}
                >
                    + New group
                </button>

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
                                    className={rowClassName(row, {
                                        dragging: isRowDragging(row),
                                        dropEdge: dropTarget?.rowKey === row.key ? dropTarget.edge : null,
                                    })}
                                    style={{transform: `translateY(${virtualRow.start}px)`}}
                                >
                                    {renderRow(row)}
                                </div>
                            );
                        })}
                    </div>

                    {/* In the scroll box, not the footer: an empty list stands in for the rows
                      * under the title rather than sitting pinned to the drawer's foot. It can
                      * never coexist with a scrollbar, so it cannot disturb one. */}
                    {!loading && !error && rows.length === 0 && (
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

                {/*
                  * None of its actions act on their own: filing goes through the same handler the
                  * drag does, and Delete goes through DeleteChatDialog, which is what refuses to
                  * delete a conversation that is mid-turn.
                  */}
                {dropActionRequest && (
                    <ChatDropActionMenu
                        label={chatHistoryRowFullLabel(dropActionRequest.chat)}
                        point={dropActionRequest.point}
                        groups={chatGroups.groups}
                        currentChatGroupId={dropActionRequest.chat.chatGroupId ?? null}
                        onNewGroup={() => {
                            chatGroups.requestCreateGroup(dropActionRequest.chat);
                            setDropActionRequest(null);
                        }}
                        onMoveToGroup={(chatGroupId) => {
                            const chat = dropActionRequest.chat;

                            setDropActionRequest(null);
                            void chatGroups.handleMoveToGroup(chat, chatGroupId);
                        }}
                        onDelete={() => {
                            setDeleteRequest({
                                chatId: dropActionRequest.chat.id,
                                chatGroupId: dropActionRequest.chat.chatGroupId ?? null,
                                label: chatHistoryRowFullLabel(dropActionRequest.chat),
                            });
                            setDropActionRequest(null);
                        }}
                        onDismiss={() => setDropActionRequest(null)}
                    />
                )}

                <ChatGroupDialogs {...chatGroups.dialogProps} streamingChatId={streamingChatId}/>

                {deleteRequest && (
                    <DeleteChatDialog
                        chatId={deleteRequest.chatId}
                        label={deleteRequest.label}
                        streaming={!!streamingChatId && deleteRequest.chatId === streamingChatId}
                        onCancel={() => setDeleteRequest(null)}
                        onDeleted={handleChatDeleted}
                    />
                )}
            </div>
        </div>
    );
}

function rowClassName(row, {dragging, dropEdge} = {}) {
    const classNames = ["chat-history-row"];

    if (row.type === CHAT_HISTORY_HEADER_ROW) {
        classNames.push("chat-history-header-row");

        if (!row.firstInList) {
            classNames.push("chat-history-header-row-spaced");
        }
    }

    if (dragging) {
        classNames.push("chat-history-row-dragging");
    }

    if (dropEdge === DROP_BEFORE) {
        classNames.push("chat-history-row-drop-before");
    } else if (dropEdge === DROP_AFTER) {
        classNames.push("chat-history-row-drop-after");
    } else if (dropEdge === DROP_ONTO) {
        classNames.push("chat-history-row-drop-onto");
    }

    return classNames.join(" ");
}

export default ChatHistory;
