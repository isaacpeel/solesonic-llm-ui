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

/* How far past the drawer the pointer has to be before leaving it counts as leaving it. */
const OUTSIDE_DROP_BAND_PIXELS = 32;

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
 * its index among that group's hand-placed conversations, or `null` for "no explicit place", which
 * leaves the conversation in, or returns it to, date order.
 *
 * `placedChatsFor(chatGroupId)` hands back the destination's placed prefix; it is a callback rather
 * than an array because the destination is not known until the row has been read.
 *
 * @returns {{chatGroupId: string|null, position: number|null}|null} null when the row is not a drop
 *          target at all — including the dragged conversation's own row.
 */
export function resolveDropDestination(row, edge, {draggedChatId, draggedChatGroupId, placedChatsFor}) {
    if (!row || !draggedChatId) {
        return null;
    }

    if (row.type === CHAT_GROUP_HEADER_ROW
        || row.type === CHAT_GROUP_EMPTY_ROW
        || row.type === CHAT_GROUP_LOAD_MORE_ROW) {
        return {chatGroupId: row.chatGroupId, position: null};
    }

    /* Every header in the ungrouped list is a day header, so all of them mean the same thing. */
    if (row.type === CHAT_HISTORY_HEADER_ROW) {
        return ungroupedDestination(draggedChatGroupId);
    }

    if (row.type !== CHAT_HISTORY_CHAT_ROW || row.chatId === draggedChatId) {
        return null;
    }

    const chatGroupId = row.chatGroupId ?? null;

    if (!chatGroupId) {
        return ungroupedDestination(draggedChatGroupId);
    }

    return {
        chatGroupId,
        position: dropPosition(placedChatsFor(chatGroupId), draggedChatId, row.chatId, edge),
    };
}

/**
 * What landing anywhere in the ungrouped list means.
 *
 * That list is a timeline: it is ordered by date and by nothing else, so there is no position in it
 * to aim at. The only move that lands here is a conversation leaving a group; one that is already
 * in the list has nowhere to go, and offering it a drop would promise an arrangement the ordering
 * cannot hold.
 */
function ungroupedDestination(draggedChatGroupId) {
    return draggedChatGroupId ? {chatGroupId: null, position: null} : null;
}

/**
 * The index a dragged conversation lands at among a group's placed conversations.
 *
 * Indices are counted with the dragged conversation taken out of the list, which is exactly how the
 * server reads `position` — see `ChatGroupService.reorderChatInGroup`.
 *
 * A group's conversations are split the same way the whole list once was: those with a
 * `groupSortOrder` come first, in that order, and the rest follow in date order. So a target that is
 * not itself placed has no index to anchor to, and what that means depends on the conversation being
 * dragged rather than on the target:
 *
 * - Dragging one that *is* placed onto a dated one reads as taking it out of the arrangement, so the
 *   drop carries no position and it falls back into date order within the group.
 * - Dragging one that is *not* placed onto another dated one reads as "put this in order". It joins
 *   the foot of the arrangement, the closest place to the drop that the two-part ordering can
 *   express — the dated conversations have no order to be inserted among.
 *
 * Reading both as "no position" is what made every drag inert in a group nobody had arranged yet:
 * the drop resolved, drew an indicator, and then did nothing at all.
 */
export function dropPosition(placedChats, draggedChatId, targetChatId, edge) {
    const allPlacedChats = placedChats ?? [];
    const remainingChats = allPlacedChats.filter(chat => chat?.id !== draggedChatId);
    const targetIndex = remainingChats.findIndex(chat => chat?.id === targetChatId);

    if (targetIndex >= 0) {
        return edge === DROP_AFTER ? targetIndex + 1 : targetIndex;
    }

    if (allPlacedChats.some(chat => chat?.id === draggedChatId)) {
        return null;
    }

    /*
     * Both edges of a dated row answer the same, because the whole dated region sits below the
     * whole arrangement — there is no position within it to aim at.
     */
    return remainingChats.length;
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
export function autoScrollStep({clientX, clientY}, scrollRectangle) {
    if (!scrollRectangle || (scrollRectangle.height ?? 0) <= 0) {
        return 0;
    }

    /* Not over the list's own column: the pointer is beside the drawer, not reaching along it. */
    if (clientX < scrollRectangle.left || clientX > scrollRectangle.right) {
        return 0;
    }

    const distanceFromTop = clientY - scrollRectangle.top;
    const distanceFromBottom = scrollRectangle.bottom - clientY;

    /*
     * The two edges are deliberately not symmetric, because what lies past them is not.
     *
     * Above the box are the drawer's title and its `+ New group` button — a drop target in its own
     * right, so a pointer up there is aiming at something, not asking to scroll. Reaching the group
     * headers above the fold is what the hot zone just inside this edge is for.
     *
     * Below the box is the bottom of the window: the scroll box runs to the foot of the drawer, so
     * a pointer down there has left the screen and is reaching for the end of the list.
     */
    if (distanceFromTop < 0) {
        return 0;
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

/**
 * Whether the pointer is far enough from the drawer to mean it.
 *
 * Releasing clear of the drawer offers to delete the conversation, so the gesture has to be
 * deliberate: a diagonal drag that clips the drawer's edge on its way down the list must not be
 * answered with a menu that has Delete in it. The band is what separates a drift from an exit.
 *
 * Every edge is checked even though the drawer is flush left and full height today, so the rule
 * still holds if it is ever moved or docked elsewhere.
 */
export function isClearOfDrawer(drawerRectangle, {clientX, clientY}) {
    if (!drawerRectangle) {
        return false;
    }

    return clientX > drawerRectangle.right + OUTSIDE_DROP_BAND_PIXELS
        || clientX < drawerRectangle.left - OUTSIDE_DROP_BAND_PIXELS
        || clientY > drawerRectangle.bottom + OUTSIDE_DROP_BAND_PIXELS
        || clientY < drawerRectangle.top - OUTSIDE_DROP_BAND_PIXELS;
}
