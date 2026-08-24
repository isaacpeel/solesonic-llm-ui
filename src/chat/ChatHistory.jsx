import {useEffect, useMemo, useRef, useState} from "react";
import {useNavigate} from "react-router";
import {useVirtualizer} from "@tanstack/react-virtual";
import {ChevronRightIcon} from "@heroicons/react/24/solid";
import {MdDragIndicator} from "react-icons/md";
import {toast} from "react-toastify";
import log from "loglevel";

import "./ChatHistory.css";
import "./ChatGroupSection.css";
import ChatRowMenu, {CHAT_HISTORY_PORTAL_ATTRIBUTE} from "./ChatRowMenu.jsx";
import CreateChatGroupDialog from "./CreateChatGroupDialog.jsx";
import DeleteChatDialog from "./DeleteChatDialog.jsx";
import {useSharedData} from "../context/useSharedData.jsx";
import usePagedChatHistory from "../hooks/usePagedChatHistory.js";
import useChatGroups from "../hooks/useChatGroups.js";
import chatService from "../service/ChatService.js";
import chatGroupService from "../service/ChatGroupService.js";
import {
    applyOrderMove,
    groupChatsByDay,
    partitionGroupedChats,
    partitionPlacedChats,
} from "../util/chatHistoryGrouping.js";
import {
    CHAT_GROUP_EMPTY_ROW,
    CHAT_GROUP_HEADER_ROW,
    CHAT_GROUP_LOAD_MORE_ROW,
    CHAT_HISTORY_HEADER_ROW,
    chatHistoryRowLabel,
    estimateChatHistoryRowSize,
    flattenChatGroupsToRows,
} from "../util/chatHistoryRows.js";
import {
    DROP_AFTER,
    DROP_BEFORE,
    DROP_ONTO,
    NEW_GROUP_DROP_ATTRIBUTE,
    isNoOpDrop,
} from "../util/chatHistoryDrag.js";
import useChatHistoryDrag from "../hooks/useChatHistoryDrag.js";

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

/* A group's own ordering column. Never `sortOrder` — that one belongs to the user's whole list. */
const GROUP_ORDER_FIELD = "groupSortOrder";

/*
 * The hand-arranged prefix of the ungrouped list. It is not day-bucketed: `groupChatsByDay` re-sorts
 * every bucket newest-first, which would silently undo the arrangement the user just made.
 */
const ARRANGED_SECTION_KEY = "arranged";

const ARRANGED_SECTION_LABEL = "Arranged";

/* Rendered as the disabled item's title, so the user learns why rather than just being blocked. */
const STREAMING_DELETE_REASON = "Wait for the response to finish.";

/*
 * Ceiling on the top-up below. A user whose entire history is filed under groups would otherwise
 * walk every page of it the moment the drawer opens.
 */
const MAXIMUM_CONSECUTIVE_EMPTY_PAGES = 10;

const DRAG_HANDLE_HINT = "Drag to move, or use the arrow keys";

function ChatHistory({userId, drawerOpen, setDrawerOpen}) {
    const {
        reloadHistoryTrigger,
        chatId: openChatId,
        setChatId,
        setChatHistory,
        streamingChatId,
        chatInputRef,
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
        setChatsDirectly,
    } = usePagedChatHistory({
        active: drawerOpen,
        reloadTrigger: reloadHistoryTrigger,
        userId,
    });

    const {
        groups,
        reloadGroups,
        chatsByGroupId,
        loadGroupChats,
        loadMoreGroupChats,
        reloadGroupChats,
        replaceGroupChat,
        removeGroupChat,
        addGroupChat,
        setGroupChatsDirectly,
    } = useChatGroups({active: drawerOpen});

    /*
     * The row being renamed is tracked here rather than in the row: rows are virtualized, so the
     * one being edited can be unmounted by a scroll and would take its state with it. `attempt`
     * remounts the editor when it is re-opened on the same chat after a rejected name, so the
     * seeded text is the one the user actually tried.
     */
    const [renamingChatId, setRenamingChatId] = useState(null);
    const [renameSeed, setRenameSeed] = useState({value: "", attempt: 0});

    /* Collapsed by default, and deliberately not persisted — persisting it is out of scope. */
    const [expandedGroupIds, setExpandedGroupIds] = useState(() => new Set());

    /* null when closed; `{chatToFile}` carries a conversation dropped onto the `+ New group` button. */
    const [createGroupRequest, setCreateGroupRequest] = useState(null);

    /*
     * null when closed; carries the row so the dialog can name the conversation and so the drawer
     * knows which group's cached page the row also has to come out of.
     */
    const [deleteRequest, setDeleteRequest] = useState(null);

    /* Two concurrent moves race on a server-side renumbering and land in an unpredictable order. */
    const [reordering, setReordering] = useState(false);

    const [emptyPageAttempts, setEmptyPageAttempts] = useState(0);

    /*
     * Both are memoized on the accumulated pages rather than recomputed per render: grouping sorts
     * every bucket and then the buckets themselves, and the drawer re-renders on every parent
     * state change, not just when a page lands.
     */
    const {ungrouped} = useMemo(() => partitionGroupedChats(chats), [chats]);

    /*
     * The hand-placed conversations are a prefix of the server's response and stay in exactly that
     * order. `sortOrder` is read only as placed-or-not: the server renumbers densely on every move,
     * but deleting a placed chat leaves a gap behind, so the stored values can read 0, 1, 3 and only
     * their relative order means anything.
     */
    const {placed: arrangedChats, unplaced: datedChats} = useMemo(
        () => partitionPlacedChats(ungrouped),
        [ungrouped],
    );

    const dayGroups = useMemo(() => groupChatsByDay(datedChats), [datedChats]);

    /*
     * Skipped entirely while nothing is placed, so a user who has never moved a conversation sees
     * the day-bucketed drawer unchanged rather than an empty section above it.
     */
    const arrangedSections = useMemo(() => (
        arrangedChats.length > 0
            ? [{
                key: ARRANGED_SECTION_KEY,
                label: ARRANGED_SECTION_LABEL,
                chats: arrangedChats,
                /* Marks the header as the top of the arrangement rather than a date boundary. */
                placed: true,
            }]
            : []
    ), [arrangedChats]);

    /*
     * Rendered in the order the API returned them — by name, then id — and never re-sorted here.
     * A group nobody has expanded has no cached page, so it carries no count and no chats.
     */
    const chatGroupSections = useMemo(() => groups.map(chatGroup => {
        const groupChats = chatsByGroupId[chatGroup.id];

        return {
            chatGroupId: chatGroup.id,
            label: chatGroup.name,
            expanded: expandedGroupIds.has(chatGroup.id),
            loading: groupChats?.loading ?? false,
            hasMore: groupChats ? !groupChats.last : false,
            count: groupChats?.totalElements ?? null,
            chats: groupChats?.chats ?? [],
        };
    }), [groups, chatsByGroupId, expandedGroupIds]);

    const rows = useMemo(
        () => flattenChatGroupsToRows([...chatGroupSections, ...arrangedSections, ...dayGroups]),
        [chatGroupSections, arrangedSections, dayGroups],
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
            replaceGroupChat(chatGroupId, chat);
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
                    removeGroupChat(chatGroupId, chatId);
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
     * Expanding is what fetches a group's first page; `loadGroupChats` is a no-op once that page has
     * landed, so collapsing and re-expanding issues no second request.
     */
    const toggleChatGroup = (chatGroupId) => {
        setExpandedGroupIds(previousIds => {
            const nextIds = new Set([...previousIds]);

            if (nextIds.has(chatGroupId)) {
                nextIds.delete(chatGroupId);
            } else {
                nextIds.add(chatGroupId);
            }

            return nextIds;
        });

        loadGroupChats(chatGroupId);
    };

    /*
     * Files a conversation into a group, optimistically.
     *
     * Patching `chatGroupId` on the accumulated pages is what takes the row out of the ungrouped
     * list — that field is the whole basis of the partition — so nothing has to be removed from it
     * and nothing has to be refetched. A destination group nobody has expanded is left alone; its
     * conversations arrive with its first page.
     *
     * Answers whether the move landed, so a drop that also carries a position knows whether the
     * conversation is actually in the destination before trying to place it there.
     */
    const handleMoveToGroup = async (chat, targetChatGroupId) => {
        const sourceChatGroupId = chat.chatGroupId ?? null;

        /* Idempotent server-side, but issuing a request for no change is noise. */
        if (sourceChatGroupId === targetChatGroupId) {
            return false;
        }

        const filedChat = {...chat, chatGroupId: targetChatGroupId, groupSortOrder: null};

        upsertChat(filedChat);

        if (sourceChatGroupId) {
            removeGroupChat(sourceChatGroupId, chat.id);
        }

        addGroupChat(targetChatGroupId, filedChat);

        try {
            await chatGroupService.addChatToGroup(targetChatGroupId, chat.id);
            return true;
        } catch (caughtError) {
            log.error('[ChatHistory] Filing a conversation into a group failed', chat.id, targetChatGroupId, caughtError);

            removeGroupChat(targetChatGroupId, chat.id);
            upsertChat(chat);

            if (sourceChatGroupId) {
                addGroupChat(sourceChatGroupId, chat);
            }

            /* The group went away from under the user, or was never theirs to write to. */
            if (caughtError.status === 404) {
                reloadGroups();
            }

            toast.error('Could not move the conversation to that group.');
            return false;
        }
    };

    /*
     * The row is put straight back into the ungrouped list rather than left for the next drawer
     * open: the user just watched it leave a group and expects to find it below. Its own timestamp
     * and order fields decide which section it lands in.
     */
    const handleRemoveFromGroup = async (chat, chatGroupId) => {
        removeGroupChat(chatGroupId, chat.id);
        upsertChat({...chat, chatGroupId: null, groupSortOrder: null});

        try {
            await chatGroupService.removeChatFromGroup(chatGroupId, chat.id);
            return true;
        } catch (caughtError) {
            log.error('[ChatHistory] Removing a conversation from a group failed', chat.id, chatGroupId, caughtError);

            /* A 404 means the client's picture of where this conversation lived was already wrong. */
            if (caughtError.status === 404) {
                reloadGroups();
                reloadGroupChats(chatGroupId);
                toast.error('That conversation was not in this group.');
                return false;
            }

            addGroupChat(chatGroupId, chat);
            upsertChat(chat);
            toast.error('Could not remove the conversation from the group.');
            return false;
        }
    };

    /*
     * Moves a conversation within one group. `position` is a zero-based index among the chats already
     * placed in *this group*, and the request goes only to the group's own order endpoint — the
     * user's whole-list ordering is a different column and must not move with it.
     */
    const handleReorderInGroup = async (chat, chatGroupId, position) => {
        const groupChats = chatsByGroupId[chatGroupId];

        if (reordering || !groupChats) {
            return;
        }

        const previousChats = groupChats.chats;

        setReordering(true);
        setGroupChatsDirectly(chatGroupId, applyOrderMove(previousChats, chat.id, position, GROUP_ORDER_FIELD));

        try {
            const movedChat = await chatGroupService.reorderChatInGroup(chatGroupId, chat.id, position);

            /* Carries the authoritative groupSortOrder, which is what settles the row's place. */
            if (movedChat) {
                replaceGroupChat(chatGroupId, movedChat);
            }
        } catch (caughtError) {
            log.error('[ChatHistory] Reordering a conversation inside a group failed', chat.id, chatGroupId, caughtError);
            setGroupChatsDirectly(chatGroupId, previousChats);
            toast.error('Could not move the conversation. Please try again.');
        } finally {
            setReordering(false);
        }
    };

    /*
     * Moves a conversation within the user's whole list.
     *
     * `position` is a zero-based index among the conversations already placed by hand — the index in
     * the rendered Arranged section — and the redraw happens before the round trip resolves, because
     * a gesture that visibly does nothing for 200ms reads as a broken control. The response carries
     * the authoritative `sortOrder`, which is what settles which section the row lands in.
     */
    const handleReorderChat = async (chat, position) => {
        if (reordering) {
            return;
        }

        const previousChats = chats;

        setReordering(true);
        setChatsDirectly(applyOrderMoveToUngrouped(previousChats, chat.id, position));

        try {
            const movedChat = await chatService.reorderChat(chat.id, position);

            if (movedChat) {
                replaceChat(movedChat);
            }
        } catch (caughtError) {
            log.error('[ChatHistory] Reordering a conversation failed', chat.id, caughtError);
            setChatsDirectly(previousChats);
            toast.error('Could not move the conversation. Please try again.');
        } finally {
            setReordering(false);
        }
    };

    /*
     * The conversations a destination has already had arranged by hand, which is the list a drop
     * position is an index into. A group that nobody has expanded has no cached page and therefore
     * nothing placed.
     */
    const placedChatsFor = (chatGroupId) => {
        if (!chatGroupId) {
            return arrangedChats;
        }

        return partitionPlacedChats(chatsByGroupId[chatGroupId]?.chats ?? [], GROUP_ORDER_FIELD).placed;
    };

    /*
     * Sets a just-moved conversation's place in the list it landed in.
     *
     * Separate from the two reorder handlers above because those redraw from the arrays as this
     * render saw them, and the state update that put the conversation into its new list has not
     * reached this closure yet. The arrangement is therefore computed with a functional update, over
     * whatever the list holds by the time React applies it.
     */
    const placeMovedChat = async (chat, chatGroupId, position) => {
        if (chatGroupId) {
            setGroupChatsDirectly(chatGroupId, previousChats => (
                applyOrderMove(previousChats, chat.id, position, GROUP_ORDER_FIELD)
            ));
        } else {
            setChatsDirectly(previousChats => applyOrderMoveToUngrouped(previousChats, chat.id, position));
        }

        try {
            const movedChat = chatGroupId
                ? await chatGroupService.reorderChatInGroup(chatGroupId, chat.id, position)
                : await chatService.reorderChat(chat.id, position);

            if (movedChat) {
                replaceChat(movedChat);

                if (chatGroupId) {
                    replaceGroupChat(chatGroupId, movedChat);
                }
            }
        } catch (caughtError) {
            log.error('[ChatHistory] Placing a moved conversation failed', chat.id, chatGroupId, caughtError);

            /*
             * The move itself landed, so there is no earlier arrangement to restore — only this
             * conversation's position is unknown. Refetching the section it landed in is the honest
             * resync; the ungrouped list settles on the next drawer open.
             */
            if (chatGroupId) {
                reloadGroupChats(chatGroupId);
            }

            toast.error('Could not move the conversation. Please try again.');
        }
    };

    /*
     * Performs a drop.
     *
     * A drop inside the list the conversation already lives in is a pure reorder. A drop into a
     * different one is two operations in a fixed order: the group move first, so the conversation is
     * actually in the destination by the time its position there is set. The whole-list ordering and
     * a group's ordering are separate columns behind separate endpoints and are never mixed.
     */
    const handleChatDrop = async (chat, destination) => {
        const sourceChatGroupId = chat.chatGroupId ?? null;
        const targetChatGroupId = destination.chatGroupId ?? null;
        const position = destination.position;

        if (sourceChatGroupId === targetChatGroupId) {
            if (isNoOpDrop(placedChatsFor(targetChatGroupId), chat.id, position)) {
                return;
            }

            if (targetChatGroupId) {
                await handleReorderInGroup(chat, targetChatGroupId, position);
                return;
            }

            await handleReorderChat(chat, position);
            return;
        }

        const moved = targetChatGroupId
            ? await handleMoveToGroup(chat, targetChatGroupId)
            : await handleRemoveFromGroup(chat, sourceChatGroupId);

        if (!moved || position === null || position === undefined) {
            return;
        }

        await placeMovedChat(chat, targetChatGroupId, position);
    };

    /*
     * The conversation a row stands for, with the group it is rendered under written onto it. A chat
     * that arrived on a page of the ungrouped list carries no `chatGroupId` field at all, and a
     * rollback that restored it untouched would leave that field missing rather than cleared.
     */
    const chatFromRow = (row) => ({...row.chat, chatGroupId: row.chatGroupId ?? null});

    /*
     * The whole gesture, from the press on a grip to the release. The `+ New group` button is one of
     * its targets, which is the only way left to create a group around a conversation now that the
     * row menu no longer offers one.
     */
    const {draggedChat, dropTarget, newGroupDropActive, dragHandleProps} = useChatHistoryDrag({
        rows,
        scrollContainerRef,
        placedChatsFor,
        onDrop: (chat, destination) => {
            void handleChatDrop(chat, destination);
        },
        onNewGroup: (chat) => setCreateGroupRequest({chatToFile: chat}),
    });

    /*
     * The keyboard equivalent of a drag, on the focused handle. Ordering left the row menu with this
     * story, so without it a keyboard user would have no way to arrange anything at all.
     *
     * A conversation that has never been placed has no neighbour to trade with, so the first
     * keystroke places it — at the head of the arrangement, or at its foot.
     */
    const handleDragHandleKeyDown = (event, row) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const chatGroupId = row.chatGroupId ?? null;
        const placedChats = placedChatsFor(chatGroupId);
        const placedIndex = placedChats.findIndex(placedChat => placedChat.id === row.chatId);

        if (placedIndex < 0) {
            const position = event.key === "ArrowUp" ? 0 : placedChats.length;

            void handleChatDrop(chatFromRow(row), {chatGroupId, position});
            return;
        }

        const position = placedIndex + (event.key === "ArrowUp" ? -1 : 1);

        /* Already at an end of the arrangement: there is nowhere for this keystroke to go. */
        if (position < 0 || position > placedChats.length - 1) {
            return;
        }

        void handleChatDrop(chatFromRow(row), {chatGroupId, position});
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
            removeGroupChat(chatGroupId, deletedChatId);
        }

        setDeleteRequest(null);
        toast('Conversation deleted');

        /*
         * Leaving the transcript of a deleted conversation on screen is the worst outcome available:
         * the next message would PUT to a chat id the server no longer has. Same sequence, in the
         * same order, as Header#handleNewChat.
         */
        if (openChatId === deletedChatId) {
            setChatHistory([]);
            setChatId(null);
            navigate("/");
        }
    };

    /*
     * The conversation is filed before the group is expanded, so the first page the group fetches
     * already contains it — expanding first would race the PUT and overwrite the optimistic row
     * with an empty page.
     */
    const handleGroupCreated = async (createdGroup) => {
        const chatToFile = createGroupRequest?.chatToFile ?? null;

        setCreateGroupRequest(null);
        reloadGroups();
        toast('Group created');

        if (!createdGroup?.id) {
            return;
        }

        if (chatToFile) {
            await handleMoveToGroup(chatToFile, createdGroup.id);
        }

        setExpandedGroupIds(previousIds => new Set([...previousIds, createdGroup.id]));
        loadGroupChats(createdGroup.id);
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
            return <div className="date-header">{row.label}</div>;
        }

        if (row.type === CHAT_GROUP_HEADER_ROW) {
            return (
                <button
                    type="button"
                    className="chat-group-header"
                    title={row.fullLabel}
                    aria-expanded={row.expanded}
                    onClick={() => toggleChatGroup(row.chatGroupId)}
                >
                    {/* A group is somewhere to drop a conversation, not something that moves
                      * itself — the API has no ordering for groups — so this grip is an
                      * affordance and nothing else. */}
                    <span className="chat-history-drag-handle chat-history-drag-handle-static">
                        <MdDragIndicator aria-hidden="true"/>
                    </span>

                    <ChevronRightIcon
                        aria-hidden="true"
                        className={row.expanded
                            ? "chat-group-chevron chat-group-chevron-expanded"
                            : "chat-group-chevron"}
                    />

                    <span className="chat-group-name">{row.label}</span>

                    {/* Absent until the group's first page has landed — the number is not known
                      * before then, and GET /chatgroups does not carry it. */}
                    {row.count !== null && (
                        <span className="chat-group-count">{row.count}</span>
                    )}
                </button>
            );
        }

        if (row.type === CHAT_GROUP_EMPTY_ROW) {
            return <div className="chat-group-empty">{row.label}</div>;
        }

        if (row.type === CHAT_GROUP_LOAD_MORE_ROW) {
            return (
                <button
                    type="button"
                    className="chat-group-load-more"
                    disabled={row.loading}
                    onClick={() => loadMoreGroupChats(row.chatGroupId)}
                >
                    {row.label}
                </button>
            );
        }

        return (
            <div
                className={row.chatGroupId ? "chat-item chat-item-in-group" : "chat-item"}
                title={row.fullLabel}
                onClick={() => handleChatClick(row.chatId)}
            >
                {row.chatId === renamingChatId ? (
                    <ChatItemRenameInput
                        key={`${row.chatId}:${renameSeed.attempt}`}
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
                            aria-label={`Reorder ${row.fullLabel}`}
                            title={DRAG_HANDLE_HINT}
                            /* `.chat-item` opens the chat; grabbing its handle must not. */
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => handleDragHandleKeyDown(event, row)}
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
            <div className="chat-drawer mt-7!">
                <h2>Chat History</h2>

                {/* Pinned under the title and outside the scroll box: anything that scrolls above
                  * the virtualizer's rows offsets every one of them. Also the target for a
                  * conversation dragged onto it, which creates the group around it. */}
                <button
                    type="button"
                    className={newGroupDropActive
                        ? "chat-history-new-group chat-history-new-group-drop-active"
                        : "chat-history-new-group"}
                    onClick={() => setCreateGroupRequest({chatToFile: null})}
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
                                        dragging: !!draggedChat && draggedChat.id === row.chatId,
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

                {createGroupRequest && (
                    <CreateChatGroupDialog
                        onCancel={() => setCreateGroupRequest(null)}
                        onCreated={handleGroupCreated}
                    />
                )}

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

/**
 * `applyOrderMove` over the ungrouped conversations only.
 *
 * The accumulated pages hold grouped conversations too, and filing one does not clear its
 * `sortOrder` — only its `groupSortOrder`. Running the move over the whole array would therefore
 * count those as part of the Arranged prefix and land the row at an index the user never aimed at.
 * The grouped ones are put back at the tail, where nothing reads them: the group sections render
 * from their own endpoint's pages, not from this list.
 */
function applyOrderMoveToUngrouped(chats, chatId, position) {
    const {grouped, ungrouped} = partitionGroupedChats(chats);

    return [...applyOrderMove(ungrouped, chatId, position), ...grouped];
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
