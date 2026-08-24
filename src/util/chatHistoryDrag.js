/*
 * Drag-and-drop arithmetic for the chat history drawer.
 *
 * Everything here is pure. A drop is resolved from three things — the row it landed on, which edge
 * of that row the pointer was nearest, and the conversations already placed by hand in the
 * destination — into the move the drawer then performs. Keeping it out of the component is what
 * makes the index arithmetic, which is the part that is easy to get wrong, testable without a DOM.
 *
 * None of this knows how the pointer got here. The drawer drives it from Pointer Events rather than
 * the HTML5 drag API, because that API is not implemented for touch input on any mobile browser.
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

/*
 * The virtualizer's own attribute — `measureElement` reads exactly this name to know which row it
 * measured, so it cannot be renamed — reused here as the anchor a hit test walks up to.
 */
const ROW_INDEX_SELECTOR = "[data-index]";

/*
 * Marks the `+ New group` button. It sits outside the scroll box, so it has no row index and cannot
 * be found the way a row is.
 */
export const NEW_GROUP_DROP_ATTRIBUTE = "data-new-group-drop";

/* How deep into the scroll box's top and bottom the pointer has to be before the list creeps. */
const AUTO_SCROLL_ZONE_PIXELS = 48;

const AUTO_SCROLL_MAXIMUM_PIXELS_PER_FRAME = 14;

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
 * Turns whatever is under the pointer into the thing that can be dropped on.
 *
 * The element handed in is the deepest one at that point — a label, an icon, the kebab — so the
 * walk up is what finds the row or the button it belongs to. Anything else, including the row menu
 * portalled onto `document.body`, resolves to nothing and is not a target.
 *
 * @returns {{rowElement: Element, rowIndex: number}|{newGroup: true}|null}
 */
export function dropTargetFromElement(element) {
    const rowElement = element?.closest?.(ROW_INDEX_SELECTOR);

    if (rowElement) {
        const rowIndex = Number(rowElement.getAttribute("data-index"));

        return Number.isInteger(rowIndex) ? {rowElement, rowIndex} : null;
    }

    if (element?.closest?.(`[${NEW_GROUP_DROP_ATTRIBUTE}]`)) {
        return {newGroup: true};
    }

    return null;
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

/**
 * How far the scroll box should creep this frame, in pixels — negative up, positive down, zero to
 * hold still.
 *
 * The HTML5 drag API scrolled a container near its edges for free. A pointer-driven drag gets
 * nothing, and on a phone the drawer is close to full height, so without this a group above the
 * fold simply cannot be reached while a finger is down.
 *
 * The speed ramps with how deep into the zone the pointer is, so resting a finger just inside the
 * edge nudges the list rather than throwing it.
 */
export function autoScrollStep(clientY, scrollRectangle) {
    if (!scrollRectangle || (scrollRectangle.height ?? 0) <= 0) {
        return 0;
    }

    const distanceFromTop = clientY - scrollRectangle.top;
    const distanceFromBottom = scrollRectangle.bottom - clientY;

    /* Dragged clear of the box: full speed toward the edge it left. */
    if (distanceFromTop < 0) {
        return -AUTO_SCROLL_MAXIMUM_PIXELS_PER_FRAME;
    }

    if (distanceFromBottom < 0) {
        return AUTO_SCROLL_MAXIMUM_PIXELS_PER_FRAME;
    }

    if (distanceFromTop < AUTO_SCROLL_ZONE_PIXELS) {
        return -rampedScrollStep(AUTO_SCROLL_ZONE_PIXELS - distanceFromTop);
    }

    if (distanceFromBottom < AUTO_SCROLL_ZONE_PIXELS) {
        return rampedScrollStep(AUTO_SCROLL_ZONE_PIXELS - distanceFromBottom);
    }

    return 0;
}

function rampedScrollStep(depthIntoZone) {
    return Math.ceil((depthIntoZone / AUTO_SCROLL_ZONE_PIXELS) * AUTO_SCROLL_MAXIMUM_PIXELS_PER_FRAME);
}
