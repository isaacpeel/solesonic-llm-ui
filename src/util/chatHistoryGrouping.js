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
