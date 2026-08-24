/*
 * Drag-and-drop arithmetic for the chat history drawer.
 *
 * Everything here is pure. A drop is resolved from three things — the row it landed on, which edge
 * of that row the pointer was nearest, and the conversations already placed by hand in the
 * destination — into the move the drawer then performs. Keeping it out of the component is what
 * makes the index arithmetic, which is the part that is easy to get wrong, testable without a DOM.
 */

import {
    CHAT_GROUP_EMPTY_ROW,
    CHAT_GROUP_HEADER_ROW,
    CHAT_GROUP_LOAD_MORE_ROW,
    CHAT_HISTORY_CHAT_ROW,
    CHAT_HISTORY_HEADER_ROW,
} from "./chatHistoryRows.js";

export const DROP_BEFORE = "before";

export const DROP_AFTER = "after";

/* A header, an empty-group line and a load-more line take the whole row rather than one of its edges. */
export const DROP_ONTO = "onto";

/**
 * Which edge of a row the pointer is nearest.
 *
 * Only a conversation row has edges: dropping above or below one is how a position is expressed.
 * Every other row type stands for a whole destination, so there is nothing to aim at within it.
 */
export function dropEdgeForRow(row, clientY, rowRectangle) {
    if (row?.type !== CHAT_HISTORY_CHAT_ROW) {
        return DROP_ONTO;
    }

    const height = rowRectangle?.height ?? 0;

    /* An unmeasured row has no halves; treating the whole of it as its top edge is the safe read. */
    if (height <= 0) {
        return DROP_BEFORE;
    }

    return (clientY - rowRectangle.top) < (height / 2) ? DROP_BEFORE : DROP_AFTER;
}

/**
 * Resolves a drop into the destination the conversation ends up in.
 *
 * `chatGroupId` is the list it lands in — `null` for the user's ungrouped list — and `position` is
 * its index among that list's hand-placed conversations, or `null` for "no explicit place", which
 * leaves the conversation in, or returns it to, date order.
 *
 * `placedChatsFor(chatGroupId)` hands back the destination's placed prefix; it is a callback rather
 * than an array because the destination is not known until the row has been read.
 *
 * @returns {{chatGroupId: string|null, position: number|null}|null} null when the row is not a drop
 *          target at all — including the dragged conversation's own row.
 */
export function resolveDropDestination(row, edge, {draggedChatId, placedChatsFor}) {
    if (!row || !draggedChatId) {
        return null;
    }

    if (row.type === CHAT_GROUP_HEADER_ROW
        || row.type === CHAT_GROUP_EMPTY_ROW
        || row.type === CHAT_GROUP_LOAD_MORE_ROW) {
        return {chatGroupId: row.chatGroupId, position: null};
    }

    if (row.type === CHAT_HISTORY_HEADER_ROW) {
        /*
         * A day header stands for the date-ordered region, so landing on one unplaces the
         * conversation. The Arranged header names the placed region itself, where "no place" would
         * mean nothing — a drop there goes to the top of it.
         */
        return {chatGroupId: null, position: row.placedSection ? 0 : null};
    }

    if (row.type !== CHAT_HISTORY_CHAT_ROW || row.chatId === draggedChatId) {
        return null;
    }

    const chatGroupId = row.chatGroupId ?? null;

    return {
        chatGroupId,
        position: dropPosition(placedChatsFor(chatGroupId), draggedChatId, row.chatId, edge),
    };
}

/**
 * The index a dragged conversation lands at among the destination's placed conversations.
 *
 * Indices are counted with the dragged conversation taken out of the list, which is exactly how the
 * server reads `position` — see `ChatService.reorderChat`. A target that is not itself placed has no
 * index to anchor to, so the drop carries no position and the conversation falls into date order.
 */
export function dropPosition(placedChats, draggedChatId, targetChatId, edge) {
    const remainingChats = (placedChats ?? []).filter(chat => chat?.id !== draggedChatId);
    const targetIndex = remainingChats.findIndex(chat => chat?.id === targetChatId);

    if (targetIndex < 0) {
        return null;
    }

    return edge === DROP_AFTER ? targetIndex + 1 : targetIndex;
}

/**
 * Whether a drop within the conversation's own list would leave the list exactly as it is.
 *
 * With the dragged conversation removed and re-inserted at `position`, the arrangement is unchanged
 * precisely when `position` equals the index it already occupies — every conversation before that
 * index keeps its place, and every one after it shifts down by one and then back. So the whole
 * check is that one comparison, and a conversation that was never placed is unchanged only by a
 * drop that does not place it either.
 */
export function isNoOpDrop(placedChats, draggedChatId, position) {
    const currentIndex = (placedChats ?? []).findIndex(chat => chat?.id === draggedChatId);

    if (currentIndex < 0) {
        return position === null || position === undefined;
    }

    return position === currentIndex;
}
