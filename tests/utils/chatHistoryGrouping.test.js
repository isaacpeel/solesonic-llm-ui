import {describe, it, expect} from 'vitest';
import {formatDayLabel, groupChatsByDay, parseChatTimestamp} from '../../src/util/chatHistoryGrouping.js';

/* The shape the backend actually returns: ISO-8601 with an offset and microsecond precision. */
function chatAt(id, timestamp) {
    return {id, timestamp, chatMessages: [{message: `message for ${id}`}]};
}

describe('parseChatTimestamp', () => {
    it('parses the offset ISO string the API sends', () => {
        const parsed = parseChatTimestamp('2026-07-30T07:33:43.671762-06:00');

        expect(parsed).toBeInstanceOf(Date);
        expect(parsed.toISOString()).toBe('2026-07-30T13:33:43.671Z');
    });

    it('reads a small number as epoch seconds and a large one as epoch milliseconds', () => {
        expect(parseChatTimestamp(1_700_000_000).toISOString()).toBe('2023-11-14T22:13:20.000Z');
        expect(parseChatTimestamp(1_700_000_000_000).toISOString()).toBe('2023-11-14T22:13:20.000Z');
    });

    it('returns null for values that cannot be a date', () => {
        expect(parseChatTimestamp(undefined)).toBeNull();
        expect(parseChatTimestamp(null)).toBeNull();
        expect(parseChatTimestamp('')).toBeNull();
        expect(parseChatTimestamp('not a date')).toBeNull();
        expect(parseChatTimestamp(new Date('nope'))).toBeNull();
    });
});

describe('formatDayLabel', () => {
    const now = new Date(2026, 7, 1, 10, 0, 0);

    it('names the current and previous day', () => {
        expect(formatDayLabel(new Date(2026, 7, 1, 0, 5, 0), now)).toBe('Today');
        expect(formatDayLabel(new Date(2026, 6, 31, 23, 55, 0), now)).toBe('Yesterday');
    });

    it('omits the year within the current year and includes it otherwise', () => {
        expect(formatDayLabel(new Date(2026, 6, 30), now)).not.toContain('2026');
        expect(formatDayLabel(new Date(2025, 6, 30), now)).toContain('2025');
    });

    it('labels a chat with no usable timestamp instead of showing an invalid date', () => {
        expect(formatDayLabel(null, now)).toBe('Undated');
    });
});

describe('groupChatsByDay', () => {
    const now = new Date(2026, 7, 1, 12, 0, 0);

    it('buckets chats into one group per local calendar day, newest day first', () => {
        const grouped = groupChatsByDay([
            chatAt('today-early', '2026-08-01T08:21:54.352316-06:00'),
            chatAt('yesterday', '2026-07-31T16:14:00.321175-06:00'),
            chatAt('today-late', '2026-08-01T10:21:54.352316-06:00'),
            chatAt('older', '2026-07-30T07:31:38.664987-06:00'),
        ], now);

        expect(grouped.map(group => group.label)).toEqual(['Today', 'Yesterday', grouped[2].label]);
        expect(grouped.map(group => group.chats.map(chat => chat.id))).toEqual([
            ['today-late', 'today-early'],
            ['yesterday'],
            ['older'],
        ]);
        expect(grouped[2].label).not.toBe('Invalid Date');
    });

    it('keys each group by its calendar day so React keys stay stable', () => {
        const grouped = groupChatsByDay([chatAt('chat-1', '2026-08-01T10:21:54.352316-06:00')], now);

        expect(grouped[0].key).toBe('2026-08-01');
    });

    it('sorts a day that arrived across two pages, not just within one', () => {
        const grouped = groupChatsByDay([
            chatAt('page-0', '2026-08-01T10:00:00.000000-06:00'),
            chatAt('page-1', '2026-08-01T11:00:00.000000-06:00'),
        ], now);

        expect(grouped[0].chats.map(chat => chat.id)).toEqual(['page-1', 'page-0']);
    });

    it('collects undated chats into a trailing group rather than dropping them', () => {
        const grouped = groupChatsByDay([
            chatAt('undated', null),
            chatAt('dated', '2026-08-01T10:21:54.352316-06:00'),
        ], now);

        expect(grouped.map(group => group.label)).toEqual(['Today', 'Undated']);
        expect(grouped[1].chats.map(chat => chat.id)).toEqual(['undated']);
    });

    it('returns nothing for an empty or missing list', () => {
        expect(groupChatsByDay([], now)).toEqual([]);
        expect(groupChatsByDay(undefined, now)).toEqual([]);
    });
});
