/*
 * Day-bucketing for the chat history drawer.
 *
 * The API sends each chat's `timestamp` as an ISO-8601 string carrying an offset
 * ("2026-07-30T07:33:43.671762-06:00"). Numbers are tolerated as well — epoch milliseconds when
 * the value is large enough to be one, epoch seconds otherwise — so a differently shaped payload
 * still lands in the right day rather than rendering as "Invalid Date".
 */

/* 1e11 as milliseconds is 1973, below any timestamp this app can see; as seconds it is year 5138. */
const EPOCH_SECONDS_UPPER_BOUND = 1e11;

const UNKNOWN_DAY_KEY = "unknown";

const UNKNOWN_DAY_LABEL = "Undated";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseChatTimestamp(timestamp) {
    if (timestamp instanceof Date) {
        return Number.isNaN(timestamp.getTime()) ? null : timestamp;
    }

    if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
        const milliseconds = Math.abs(timestamp) < EPOCH_SECONDS_UPPER_BOUND ? timestamp * 1000 : timestamp;

        return toValidDate(new Date(milliseconds));
    }

    if (typeof timestamp === "string" && timestamp.trim() !== "") {
        return toValidDate(new Date(timestamp));
    }

    return null;
}

function toValidDate(date) {
    return Number.isNaN(date.getTime()) ? null : date;
}

/* Local calendar day, so a chat is grouped by the day the user experienced, not by UTC. */
function dayKey(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dayOfMonth = String(date.getDate()).padStart(2, "0");

    return `${date.getFullYear()}-${month}-${dayOfMonth}`;
}

function calendarDaysBetween(date, now) {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    /* Rounded because a DST boundary between the two makes the difference 23 or 25 hours. */
    return Math.round((startOfToday.getTime() - startOfDay.getTime()) / MILLISECONDS_PER_DAY);
}

export function formatDayLabel(date, now = new Date()) {
    if (!date) {
        return UNKNOWN_DAY_LABEL;
    }

    const daysAgo = calendarDaysBetween(date, now);

    if (daysAgo === 0) {
        return "Today";
    }

    if (daysAgo === 1) {
        return "Yesterday";
    }

    /* No weekday, so the header stays on one line in the 250px drawer. */
    if (date.getFullYear() === now.getFullYear()) {
        return date.toLocaleDateString(undefined, {month: "long", day: "numeric"});
    }

    return date.toLocaleDateString(undefined, {month: "long", day: "numeric", year: "numeric"});
}

/**
 * Buckets chats into one group per local calendar day, newest day first and newest chat first
 * within a day.
 *
 * The ordering is computed rather than inherited from the response: the drawer appends page after
 * page, and a chat started while it is open can arrive out of order.
 *
 * @returns {Array<{key: string, label: string, date: Date|null, chats: Array}>}
 */
export function groupChatsByDay(chats, now = new Date()) {
    const groups = new Map();

    for (const chat of chats ?? []) {
        const date = parseChatTimestamp(chat?.timestamp);
        const key = date ? dayKey(date) : UNKNOWN_DAY_KEY;

        let group = groups.get(key);

        if (!group) {
            group = {key, date, chats: []};
            groups.set(key, group);
        }

        group.chats.push(chat);
    }

    const groupedChats = [...groups.values()];

    for (const group of groupedChats) {
        group.chats.sort(compareChatsNewestFirst);
    }

    /* Keys are zero-padded ISO days, so a plain string compare is chronological. Undated last. */
    groupedChats.sort((firstGroup, secondGroup) => {
        if (firstGroup.key === UNKNOWN_DAY_KEY) {
            return 1;
        }

        if (secondGroup.key === UNKNOWN_DAY_KEY) {
            return -1;
        }

        return secondGroup.key.localeCompare(firstGroup.key);
    });

    return groupedChats.map(group => ({
        key: group.key,
        label: formatDayLabel(group.date, now),
        date: group.date,
        chats: group.chats,
    }));
}

function compareChatsNewestFirst(firstChat, secondChat) {
    const firstDate = parseChatTimestamp(firstChat?.timestamp);
    const secondDate = parseChatTimestamp(secondChat?.timestamp);

    if (!firstDate && !secondDate) {
        return 0;
    }

    if (!firstDate) {
        return 1;
    }

    if (!secondDate) {
        return -1;
    }

    return secondDate.getTime() - firstDate.getTime();
}

/**
 * Splits the accumulated pages into the conversations filed under a group and the ones that are not.
 *
 * \`GET /chats/users/{userId}\` returns every chat, grouped or not, and the API has no ungrouped-only
 * variant — so without this filter every filed conversation would render twice: once under its group
 * section and once in the day-bucketed list below it.
 *
 * A blank \`chatGroupId\` counts as ungrouped; only a real id files a chat.
 */
export function partitionGroupedChats(chats) {
    const grouped = (chats ?? []).filter(chat => !!chat?.chatGroupId);
    const ungrouped = (chats ?? []).filter(chat => !chat?.chatGroupId);

    return {grouped, ungrouped};
}

/**
 * Splits a list into the hand-placed prefix and the rest, preserving input order in both halves.
 *
 * The order field is read only as placed-or-not; its value is never used as an index. The server
 * renumbers densely on every move, but removing a chat leaves a gap behind, so the stored values can
 * read 0, 1, 3 — only their relative order is meaningful.
 *
 * \`orderField\` picks which of the two independent orderings is being read: \`sortOrder\` for the
 * user's whole list, \`groupSortOrder\` for one group's list. They are separate columns behind
 * separate endpoints, and mixing them silently reshuffles the list the user was not looking at.
 */
export function partitionPlacedChats(chats, orderField = "sortOrder") {
    const placed = (chats ?? []).filter(chat => isPlacedChat(chat, orderField));
    const unplaced = (chats ?? []).filter(chat => !isPlacedChat(chat, orderField));

    return {placed, unplaced};
}

export function isPlacedChat(chat, orderField = "sortOrder") {
    const order = chat?.[orderField];

    return order !== null && order !== undefined;
}

/**
 * Applies an ordering move to a rendered list, for the optimistic redraw that has to happen before
 * the server answers — a menu click that visibly does nothing for a round trip reads as a broken
 * button.
 *
 * \`position\` is a zero-based index among the chats that are already placed, not an index into the
 * rendered list, and \`null\` unplaces the chat and returns it to timestamp order. The numbers written
 * onto the placed prefix here are placeholders that only have to satisfy \`isPlacedChat\`; the
 * authoritative values arrive with the response and are merged over them.
 */
export function applyOrderMove(chats, chatId, position, orderField = "sortOrder") {
    const movedChat = (chats ?? []).find(chat => chat?.id === chatId);

    if (!movedChat) {
        return chats ?? [];
    }

    const {placed, unplaced} = partitionPlacedChats(chats, orderField);
    const remainingPlaced = placed.filter(chat => chat.id !== chatId);
    const remainingUnplaced = unplaced.filter(chat => chat.id !== chatId);

    if (position === null || position === undefined) {
        const restoredChats = [...remainingUnplaced, {...movedChat, [orderField]: null}];
        restoredChats.sort(compareChatsNewestFirst);

        return [...remainingPlaced, ...restoredChats];
    }

    const targetIndex = Math.min(Math.max(position, 0), remainingPlaced.length);
    const nextPlaced = [...remainingPlaced];
    nextPlaced.splice(targetIndex, 0, movedChat);

    return [
        ...nextPlaced.map((chat, index) => ({...chat, [orderField]: index})),
        ...remainingUnplaced,
    ];
}
