/*
 * Flat row model for the virtualized chat history drawer.
 *
 * A virtualizer addresses rows by index, so the nested shape `groupChatsByDay` produces — groups
 * holding chats — has to be flattened into a single list where a date header and a chat each count
 * as one row. Everything here is pure, so the row model is testable without a DOM.
 */

export const CHAT_HISTORY_HEADER_ROW = "header";

export const CHAT_HISTORY_CHAT_ROW = "chat";

/*
 * Conversation groups live in this same flat list rather than in a scroll box of their own: two
 * independent infinite scrolls inside one scroll container fight each other, and a nested scroller
 * would clip the row menus that are already portalled out of it.
 */
export const CHAT_GROUP_HEADER_ROW = "groupHeader";

export const CHAT_GROUP_EMPTY_ROW = "groupEmpty";

export const CHAT_GROUP_LOAD_MORE_ROW = "groupLoadMore";

/* Longest message that still fits the 250px drawer on one line; longer ones are ellipsized. */
const MAXIMUM_LABEL_LENGTH = 25;

const NO_MESSAGES_LABEL = "No messages yet";

export const NO_GROUP_CHATS_LABEL = "No conversations yet.";

export const GROUP_LOAD_MORE_LABEL = "Load more";

export const GROUP_LOADING_LABEL = "Loading…";

/*
 * First-paint guesses only — `measureElement` replaces them with real heights as rows mount. They
 * only have to be close enough that the scrollbar does not visibly jump once measuring catches up.
 */
const ESTIMATED_HEADER_ROW_HEIGHT = 62;

/* Matches `.chat-history-header-row-spaced`'s padding-top — every header but the first carries
 * this, and omitting it here left every one of them under-measured, so the virtualizer corrected
 * the total size on every header scrolled past and the correction compounded further into the list. */
const ESTIMATED_HEADER_ROW_SPACING = 20;

const ESTIMATED_CHAT_ROW_HEIGHT = 41;

/*
 * A group header, the empty-group line and the load-more line are all one-line boxes carrying the
 * same padding and separator as a chat row, so they share its height. A group's chat rows are
 * indented with padding-left on an inner element for the same reason — an indent that changed a
 * row's height would invalidate the position of every row under it.
 */
const ESTIMATED_CHAT_GROUP_ROW_HEIGHT = ESTIMATED_CHAT_ROW_HEIGHT;

/*
 * The label a chat is known by, untruncated.
 *
 * A name the user gave the chat wins outright; the first message is only ever a stand-in for one.
 * A name that is blank once trimmed is treated as no name at all — the server trims before storing,
 * so whitespace can only reach us from a stale client, and rendering an empty row is worse than
 * falling back.
 */
export function chatHistoryRowFullLabel(chat) {
    const name = chat?.name;

    if (typeof name === "string" && name.trim() !== "") {
        return name.trim();
    }

    const firstMessage = chat?.chatMessages?.[0]?.message;

    if (!firstMessage) {
        return NO_MESSAGES_LABEL;
    }

    return firstMessage;
}

/* The row's whole visible content, so the row stays one line and its height stays predictable. */
export function chatHistoryRowLabel(chat) {
    const fullLabel = chatHistoryRowFullLabel(chat);

    if (fullLabel.length > MAXIMUM_LABEL_LENGTH) {
        return fullLabel.slice(0, MAXIMUM_LABEL_LENGTH) + "...";
    }

    return fullLabel;
}

/*
 * The conversation a row stands for, with the group it is rendered under written onto it. A chat
 * that arrived on a page of the ungrouped list carries no `chatGroupId` field at all, and a
 * rollback that restored it untouched would leave that field missing rather than cleared.
 */
export function chatFromRow(row) {
    return {...row.chat, chatGroupId: row.chatGroupId ?? null};
}

/**
 * Flattens the drawer's sections into the virtualizer's index space.
 *
 * A section is either a day bucket from `groupChatsByDay` — `{key, label, chats}` — or a
 * conversation group, marked by a `chatGroupId` and carrying its own expanded, loading and paging
 * state. Group sections render above the day buckets, in the order the API returned them.
 *
 * `firstInList` exists because the gap that used to come from `.date-group`'s bottom margin now
 * has to be padding on the header row — margins are invisible to row measurement — and the very
 * first header must not carry it, or the list starts with a blank band.
 *
 * Every chat row carries the chat itself rather than a growing list of copied fields: the row
 * actions read `name` today and ordering and grouping will read more of it, and threading one more
 * property through per feature does not scale.
 *
 * @param {Array<{key?: string, label?: string, chats?: Array, chatGroupId?: string, expanded?: boolean, loading?: boolean, hasMore?: boolean, count?: number|null}>} sections
 * @returns {Array<{type: string, key: string, label: string, chatId?: *, fullLabel?: string, chat?: *, chatGroupId?: string, dayKey?: string, expanded?: boolean, loading?: boolean, count?: number|null, firstInList?: boolean}>}
 */
export function flattenChatGroupsToRows(sections) {
    const rows = [];

    for (const section of sections ?? []) {
        if (section?.chatGroupId) {
            rows.push(...chatGroupSectionRows(section));
            continue;
        }

        /*
         * A day bucket collapses the way a conversation group does, but starts the other way round:
         * the drawer's whole point is the timeline, so a day is open unless the user has closed it
         * and the section says so outright.
         */
        const expanded = section.expanded !== false;

        rows.push({
            type: CHAT_HISTORY_HEADER_ROW,
            key: `header:${section.key}`,
            dayKey: section.key,
            label: section.label,
            expanded: expanded,
            firstInList: rows.length === 0,
        });

        if (!expanded) {
            continue;
        }

        for (const chat of section.chats ?? []) {
            rows.push(chatRow(chat, null));
        }
    }

    return rows;
}

/*
 * A collapsed group is one row and nothing else — a user with eight groups must not open the drawer
 * onto eight expanded lists, so every group starts collapsed and its chats are fetched on the first
 * expand.
 *
 * The trailing load-more line is a row rather than a second scroll sentinel on purpose: the drawer's
 * own sentinel pages the ungrouped list off this same scroll box, and a group paging itself off the
 * same scroll position would race against it.
 */
function chatGroupSectionRows(section) {
    const rows = [{
        type: CHAT_GROUP_HEADER_ROW,
        key: `groupHeader:${section.chatGroupId}`,
        chatGroupId: section.chatGroupId,
        label: section.label,
        fullLabel: section.label,
        expanded: !!section.expanded,
        loading: !!section.loading,
        /* Only known once a first page has landed; a never-expanded group carries no count. */
        count: Number.isInteger(section.count) ? section.count : null,
    }];

    if (!section.expanded) {
        return rows;
    }

    const chats = section.chats ?? [];

    for (const chat of chats) {
        rows.push(chatRow(chat, section.chatGroupId));
    }

    if (chats.length === 0 && !section.loading) {
        rows.push({
            type: CHAT_GROUP_EMPTY_ROW,
            key: `groupEmpty:${section.chatGroupId}`,
            chatGroupId: section.chatGroupId,
            label: NO_GROUP_CHATS_LABEL,
        });
    }

    if (section.hasMore) {
        rows.push({
            type: CHAT_GROUP_LOAD_MORE_ROW,
            key: `groupLoadMore:${section.chatGroupId}`,
            chatGroupId: section.chatGroupId,
            label: section.loading ? GROUP_LOADING_LABEL : GROUP_LOAD_MORE_LABEL,
            loading: !!section.loading,
        });
    }

    return rows;
}

/*
 * Group chat rows are keyed by group as well as by chat, so the same conversation still sitting in
 * the ungrouped list for one render — mid-move, before the filter catches up — cannot collide with
 * its row inside a group and hand the virtualizer a duplicate key.
 */
function chatRow(chat, chatGroupId) {
    return {
        type: CHAT_HISTORY_CHAT_ROW,
        key: chatGroupId ? `groupChat:${chatGroupId}:${chat.id}` : `chat:${chat.id}`,
        chatId: chat.id,
        chatGroupId: chatGroupId,
        label: chatHistoryRowLabel(chat),
        fullLabel: chatHistoryRowFullLabel(chat),
        chat: chat,
    };
}

export function estimateChatHistoryRowSize(row) {
    if (row?.type === CHAT_HISTORY_HEADER_ROW) {
        return row.firstInList
            ? ESTIMATED_HEADER_ROW_HEIGHT
            : ESTIMATED_HEADER_ROW_HEIGHT + ESTIMATED_HEADER_ROW_SPACING;
    }

    if (row?.type === CHAT_GROUP_HEADER_ROW
        || row?.type === CHAT_GROUP_EMPTY_ROW
        || row?.type === CHAT_GROUP_LOAD_MORE_ROW) {
        return ESTIMATED_CHAT_GROUP_ROW_HEIGHT;
    }

    return ESTIMATED_CHAT_ROW_HEIGHT;
}
