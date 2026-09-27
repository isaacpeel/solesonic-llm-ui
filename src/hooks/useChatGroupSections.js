import {useMemo, useState} from 'react';
import {toast} from 'react-toastify';
import log from 'loglevel';

import useChatGroups from './useChatGroups.js';
import chatGroupService from '../service/ChatGroupService.js';
import {applyOrderMove, applyRankMove, changedRanks, partitionPlacedChats} from '../util/chatHistoryGrouping.js';
import {isNoOpDrop} from '../util/chatHistoryDrag.js';
import {chatFromRow} from '../util/chatHistoryRows.js';

/* A group's own ordering column. Never `sortOrder` — that one belongs to the user's whole list. */
const GROUP_ORDER_FIELD = "groupSortOrder";

/* A group's place among the other groups, which is the group entity's own column. */
const CHAT_GROUP_ORDER_FIELD = "sortOrder";

/* Shared empty array, so `placedChatsFor` does not hand out a new one on every render. */
const NO_PLACED_CHATS = [];

/* Matches the server column, so a name long enough to be refused cannot be committed. */
const MAXIMUM_GROUP_NAME_LENGTH = 255;

const GROUP_NAME_REJECTED_MESSAGE = 'That name could not be saved. Names must be 1–255 characters.';

/**
 * The conversation-group half of the chat history drawer.
 *
 * Wraps `useChatGroups` — which owns the group list and each group's paged conversations — and adds
 * everything the drawer does *with* them: expand and collapse, the sections the row model is
 * flattened from, filing and unfiling a conversation, ordering within one group, and the two group
 * dialogs.
 *
 * The three list mutators are handed in rather than fetched here because they belong to
 * `usePagedChatHistory`: filing a conversation into a group is what takes it out of the ungrouped
 * list, so both halves of the drawer have to be patched by the same move.
 *
 * `onChatsDeleted` is the drawer's business and not this hook's: a deleted conversation may be the
 * one on screen, and closing that transcript is a routing concern.
 *
 * @param {{
 *   active: boolean,
 *   replaceChat: (chat: object) => void,
 *   upsertChat: (chat: object) => void,
 *   removeChat: (chatId: string) => void,
 *   onChatsDeleted: (deletedChatIds: Array<string>) => void,
 *   onReloadHistory: () => void,
 * }} options
 */
function useChatGroupSections({
    active,
    replaceChat,
    upsertChat,
    removeChat,
    onChatsDeleted,
    onReloadHistory,
}) {
    const {
        groups,
        reloadGroups,
        setGroupsDirectly,
        replaceGroups,
        chatsByGroupId,
        loadGroupChats,
        loadMoreGroupChats,
        reloadGroupChats,
        replaceGroupChat,
        removeGroupChat,
        addGroupChat,
        setGroupChatsDirectly,
    } = useChatGroups({active});

    /* Collapsed by default, and deliberately not persisted — persisting it is out of scope. */
    const [expandedGroupIds, setExpandedGroupIds] = useState(() => new Set());

    /* null when closed; `{chatToFile}` carries a conversation dropped onto the `+ New group` button. */
    const [createGroupRequest, setCreateGroupRequest] = useState(null);

    /* null when closed; carries the group so the dialog can name what is about to go. */
    const [deleteGroupRequest, setDeleteGroupRequest] = useState(null);

    /* Two concurrent moves race on a server-side renumbering and land in an unpredictable order. */
    const [reordering, setReordering] = useState(false);

    /* The same guard, for the list of groups. Separate, so arranging one does not block the other. */
    const [reorderingGroups, setReorderingGroups] = useState(false);

    /*
     * Rendered in the order the API returned them — `sortOrder` ascending with nulls last, then
     * name, then id — and never re-sorted here. A group nobody has expanded has no cached page, so
     * it carries no count and no chats.
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
            log.error('[useChatGroupSections] Filing a conversation into a group failed', chat.id, targetChatGroupId, caughtError);

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
            log.error('[useChatGroupSections] Removing a conversation from a group failed', chat.id, chatGroupId, caughtError);

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
            log.error('[useChatGroupSections] Reordering a conversation inside a group failed', chat.id, chatGroupId, caughtError);
            setGroupChatsDirectly(chatGroupId, previousChats);
            toast.error('Could not move the conversation. Please try again.');
        } finally {
            setReordering(false);
        }
    };

    /*
     * The conversations a group has already had arranged by hand, which is the list a drop position
     * is an index into. A group that nobody has expanded has no cached page and therefore nothing
     * placed, and the ungrouped list has no arrangement at all.
     */
    const placedChatsFor = (chatGroupId) => {
        if (!chatGroupId) {
            return NO_PLACED_CHATS;
        }

        return partitionPlacedChats(chatsByGroupId[chatGroupId]?.chats ?? [], GROUP_ORDER_FIELD).placed;
    };

    /*
     * Sets a just-moved conversation's place in the group it landed in.
     *
     * Separate from `handleReorderInGroup` because that redraws from the array as this render saw
     * it, and the state update that put the conversation into its new group has not reached this
     * closure yet. The arrangement is therefore computed with a functional update, over whatever the
     * group holds by the time React applies it.
     */
    const placeMovedChat = async (chat, chatGroupId, position) => {
        setGroupChatsDirectly(chatGroupId, previousChats => (
            applyOrderMove(previousChats, chat.id, position, GROUP_ORDER_FIELD)
        ));

        try {
            const movedChat = await chatGroupService.reorderChatInGroup(chatGroupId, chat.id, position);

            if (movedChat) {
                replaceChat(movedChat);
                replaceGroupChat(chatGroupId, movedChat);
            }
        } catch (caughtError) {
            log.error('[useChatGroupSections] Placing a moved conversation failed', chat.id, chatGroupId, caughtError);

            /*
             * The move itself landed, so there is no earlier arrangement to restore — only this
             * conversation's position is unknown. Refetching the group it landed in is the honest
             * resync.
             */
            reloadGroupChats(chatGroupId);
            toast.error('Could not move the conversation. Please try again.');
        }
    };

    /*
     * Performs a drop.
     *
     * A drop inside the group the conversation already lives in is a pure reorder. A drop into a
     * different list is two operations in a fixed order: the group move first, so the conversation
     * is actually in the destination by the time its position there is set.
     */
    const handleChatDrop = async (chat, destination) => {
        const sourceChatGroupId = chat.chatGroupId ?? null;
        const targetChatGroupId = destination.chatGroupId ?? null;
        const position = destination.position;

        if (sourceChatGroupId === targetChatGroupId) {
            /* Only a group holds an order to move within; the ungrouped list is a timeline. */
            if (!targetChatGroupId || isNoOpDrop(placedChatsFor(targetChatGroupId), chat.id, position)) {
                return;
            }

            await handleReorderInGroup(chat, targetChatGroupId, position);
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
     * The rendered list of groups, which is the list a group drop position is an index into. Every
     * group counts, arranged or not: a rank is stated by the client rather than renumbered by the
     * server, so the arrangement is the whole visible list or it is ambiguous.
     */
    const orderedGroups = () => groups;

    /*
     * Moves a group within the user's list of groups.
     *
     * The whole section travels with its header: the rows are flattened from `groups`, so reordering
     * that array carries a group's conversations with it and an expanded group stays expanded.
     *
     * There is no bulk endpoint and no server-side renumbering, so the arrangement is stated one
     * group at a time — the visible list is renumbered from zero and every group the renumbering
     * actually moved is written. Each request carries the group whole, name included: a body with
     * only a rank in it is refused, and one with only a name unplaces the group.
     */
    const handleGroupDrop = async (chatGroupId, position) => {
        const previousGroups = groups;

        if (reorderingGroups || !previousGroups.some(group => group.id === chatGroupId)) {
            return;
        }

        const rankedGroups = applyRankMove(previousGroups, chatGroupId, position, CHAT_GROUP_ORDER_FIELD);
        const movedGroups = changedRanks(previousGroups, rankedGroups, CHAT_GROUP_ORDER_FIELD);

        if (movedGroups.length === 0) {
            return;
        }

        setReorderingGroups(true);
        setGroupsDirectly(rankedGroups);

        try {
            const updatedGroups = [];

            for (const movedGroup of movedGroups) {
                const updatedGroup = await chatGroupService.updateChatGroup(movedGroup);

                if (updatedGroup) {
                    updatedGroups.push(updatedGroup);
                }
            }

            /* Carry the authoritative sortOrder, which is what settles each group's place. */
            if (updatedGroups.length > 0) {
                replaceGroups(updatedGroups);
            }
        } catch (caughtError) {
            log.error('[useChatGroupSections] Reordering a group failed', chatGroupId, caughtError);
            setGroupsDirectly(previousGroups);

            /* A group went away from under the user, so the whole picture of the sidebar is stale. */
            if (caughtError.status === 404) {
                reloadGroups();
            }

            toast.error('Could not move the group. Please try again.');
        } finally {
            setReorderingGroups(false);
        }
    };

    /*
     * Renames a group, carrying its rank through untouched.
     *
     * The rank has to travel with the name because the endpoint is a full update: sending the name
     * on its own reads as `sortOrder: null` and drops the group out of the arrangement it was in.
     *
     * Answers whether the drawer is done with the edit. A rejected name is the one case it is not —
     * the editor is reopened on what the user typed rather than throwing the attempt away.
     */
    const handleRenameGroup = async (chatGroupId, name) => {
        const trimmedName = name.trim();
        const existingGroup = groups.find(group => group.id === chatGroupId);

        if (!existingGroup || trimmedName === existingGroup.name) {
            return true;
        }

        /* Cleared and committed means "never mind", and the server would refuse a blank name anyway. */
        if (trimmedName === "") {
            return true;
        }

        /* The editor caps the field at the same length, so this is only ever reached by a stale one. */
        if (trimmedName.length > MAXIMUM_GROUP_NAME_LENGTH) {
            toast.error(GROUP_NAME_REJECTED_MESSAGE);
            return false;
        }

        /* Optimistic: the header changing is the confirmation, so it must not wait on the round trip. */
        replaceGroups([{...existingGroup, name: trimmedName}]);

        try {
            const renamedGroup = await chatGroupService.updateChatGroup({
                ...existingGroup,
                name: trimmedName,
            });

            if (renamedGroup) {
                replaceGroups([renamedGroup]);
            }

            return true;
        } catch (caughtError) {
            log.error('[useChatGroupSections] Renaming a group failed', chatGroupId, caughtError);
            replaceGroups([existingGroup]);

            if (caughtError.status === 404) {
                reloadGroups();
                toast.error('That group no longer exists.');
                return true;
            }

            if (caughtError.status === 400) {
                toast.error(GROUP_NAME_REJECTED_MESSAGE);
                return false;
            }

            toast.error('Could not rename the group. Please try again.');
            return true;
        }
    };

    /*
     * The keyboard equivalent of dragging a group, on its focused grip. Unlike a conversation, a
     * group has nowhere else to go — there is only one list of them — so both arrows always mean a
     * move within it, and the index is into the whole rendered list rather than an arranged subset.
     */
    const handleGroupDragHandleKeyDown = (event, chatGroupId) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const arrangedGroups = orderedGroups();
        const currentIndex = arrangedGroups.findIndex(group => group.id === chatGroupId);

        if (currentIndex < 0) {
            return;
        }

        const position = currentIndex + (event.key === "ArrowUp" ? -1 : 1);

        /* Already at an end of the list: there is nowhere for this keystroke to go. */
        if (position < 0 || position > arrangedGroups.length - 1) {
            return;
        }

        void handleGroupDrop(chatGroupId, position);
    };

    /*
     * The keyboard equivalent of a drag, on the focused handle. Ordering left the row menu with the
     * drag-and-drop story, so without it a keyboard user would have no way to arrange anything.
     *
     * Only inside a group: the ungrouped list is ordered by date, so there is nothing there for an
     * arrow key to move a conversation past.
     *
     * A conversation that has never been placed has no neighbour to trade with, so the first
     * keystroke places it — at the head of the group's arrangement, or at its foot.
     */
    const handleDragHandleKeyDown = (event, row) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
            return;
        }

        const chatGroupId = row.chatGroupId ?? null;

        if (!chatGroupId) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

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
     * `deletedChatIds` is empty when only the group was removed: the API ungroups rather than
     * cascades, so those conversations are still there and have to be found again.
     */
    const forgetDeletedChats = (deletedChatIds) => {
        for (const deletedChatId of deletedChatIds) {
            removeChat(deletedChatId);
        }

        onChatsDeleted(deletedChatIds);
    };

    /*
     * A cascade that stopped part-way. The group is still there holding whatever was not reached,
     * so only the rows that are actually gone come out — and the dialog stays open to say so.
     */
    const handleGroupConversationsDeleted = (deletedChatIds) => {
        forgetDeletedChats(deletedChatIds);
        reloadGroupChats(deleteGroupRequest?.chatGroupId);
    };

    /*
     * Patching every cached row would only cover the ones already paged in, so a group that was
     * removed on its own reloads the whole history — which is also what puts its conversations back
     * into their day buckets.
     */
    const handleChatGroupDeleted = (deletedChatGroupId, deletedChatIds) => {
        setDeleteGroupRequest(null);
        forgetDeletedChats(deletedChatIds);

        setExpandedGroupIds(previousIds => {
            const nextIds = new Set([...previousIds]);
            nextIds.delete(deletedChatGroupId);

            return nextIds;
        });

        reloadGroups();

        /* Only the group went; its conversations are ungrouped now and belong in the day buckets. */
        if (deletedChatIds.length === 0) {
            onReloadHistory();
        }

        toast(deletedChatIds.length === 0
            ? 'Group deleted'
            : `Group and ${deletedChatIds.length} conversation${deletedChatIds.length === 1 ? '' : 's'} deleted`);
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

    return {
        groups,
        chatGroupSections,
        toggleChatGroup,
        loadMoreGroupChats,
        placedChatsFor,
        orderedGroups,
        handleChatDrop,
        handleGroupDrop,
        handleRenameGroup,
        handleMoveToGroup,
        handleDragHandleKeyDown,
        handleGroupDragHandleKeyDown,
        replaceGroupChat,
        removeGroupChat,
        requestCreateGroup: (chatToFile = null) => setCreateGroupRequest({chatToFile}),
        requestDeleteGroup: (request) => setDeleteGroupRequest(request),
        dialogProps: {
            createGroupRequest,
            deleteGroupRequest,
            onCancelCreate: () => setCreateGroupRequest(null),
            onCreated: handleGroupCreated,
            onCancelDelete: () => setDeleteGroupRequest(null),
            onConversationsDeleted: handleGroupConversationsDeleted,
            onDeleted: handleChatGroupDeleted,
        },
    };
}

export default useChatGroupSections;
