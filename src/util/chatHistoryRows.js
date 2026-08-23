/*
 * Flat row model for the virtualized chat history drawer.
 *
 * A virtualizer addresses rows by index, so the nested shape `groupChatsByDay` produces — groups
 * holding chats — has to be flattened into a single list where a date header and a chat each count
 * as one row. Everything here is pure, so the row model is testable without a DOM.
 */

export const CHAT_HISTORY_HEADER_ROW = "header";

export const CHAT_HISTORY_CHAT_ROW = "chat";

/* Longest message that still fits the 250px drawer on one line; longer ones are ellipsized. */
const MAXIMUM_LABEL_LENGTH = 25;

const NO_MESSAGES_LABEL = "No messages yet";

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

/**
 * Flattens day groups into the virtualizer's index space.
 *
 * `firstInList` exists because the gap that used to come from `.date-group`'s bottom margin now
 * has to be padding on the header row — margins are invisible to row measurement — and the very
 * first header must not carry it, or the list starts with a blank band.
 *
 * Every chat row carries the chat itself rather than a growing list of copied fields: the row
 * actions read `name` today and ordering and grouping will read more of it, and threading one more
 * property through per feature does not scale.
 *
 * @returns {Array<{type: string, key: string, label: string, chatId?: *, fullLabel?: string, chat?: *, firstInList?: boolean}>}
 */
export function flattenChatGroupsToRows(groupedChats) {
    const rows = [];

    for (const group of groupedChats ?? []) {
        rows.push({
            type: CHAT_HISTORY_HEADER_ROW,
            key: `header:${group.key}`,
            label: group.label,
            firstInList: rows.length === 0,
        });

        for (const chat of group.chats ?? []) {
            rows.push({
                type: CHAT_HISTORY_CHAT_ROW,
                key: `chat:${chat.id}`,
                chatId: chat.id,
                label: chatHistoryRowLabel(chat),
                fullLabel: chatHistoryRowFullLabel(chat),
                chat: chat,
            });
        }
    }

    return rows;
}

export function estimateChatHistoryRowSize(row) {
    if (row?.type === CHAT_HISTORY_HEADER_ROW) {
        return row.firstInList
            ? ESTIMATED_HEADER_ROW_HEIGHT
            : ESTIMATED_HEADER_ROW_HEIGHT + ESTIMATED_HEADER_ROW_SPACING;
    }

    return ESTIMATED_CHAT_ROW_HEIGHT;
}
