import {describe, it, expect} from 'vitest';
import {
    applyOrderMove,
    applyRankMove,
    changedRanks,
    formatDayLabel,
    groupChatsByDay,
    parseChatTimestamp,
    partitionGroupedChats,
    partitionPlacedChats,
} from '../../src/util/chatHistoryGrouping.js';

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

describe('partitionGroupedChats', () => {
    it('splits on chatGroupId', () => {
        const {grouped, ungrouped} = partitionGroupedChats([
            {id: 'filed', chatGroupId: 'group-1'},
            {id: 'loose', chatGroupId: null},
            {id: 'never-filed'},
        ]);

        expect(grouped.map(chat => chat.id)).toEqual(['filed']);
        expect(ungrouped.map(chat => chat.id)).toEqual(['loose', 'never-filed']);
    });

    /* A blank id is not a group; treating it as one would hide the row from both sections. */
    it('counts an empty-string chatGroupId as ungrouped', () => {
        const {grouped, ungrouped} = partitionGroupedChats([{id: 'blank', chatGroupId: ''}]);

        expect(grouped).toEqual([]);
        expect(ungrouped.map(chat => chat.id)).toEqual(['blank']);
    });

    it('preserves input order in both halves', () => {
        const {grouped, ungrouped} = partitionGroupedChats([
            {id: 'a', chatGroupId: 'group-1'},
            {id: 'b'},
            {id: 'c', chatGroupId: 'group-2'},
            {id: 'd'},
        ]);

        expect(grouped.map(chat => chat.id)).toEqual(['a', 'c']);
        expect(ungrouped.map(chat => chat.id)).toEqual(['b', 'd']);
    });

    it('returns two empty halves for an empty or missing list', () => {
        expect(partitionGroupedChats([])).toEqual({grouped: [], ungrouped: []});
        expect(partitionGroupedChats(undefined)).toEqual({grouped: [], ungrouped: []});
    });
});

describe('partitionPlacedChats', () => {
    it('splits on null versus non-null sortOrder, and treats undefined as unplaced', () => {
        const {placed, unplaced} = partitionPlacedChats([
            {id: 'pinned', sortOrder: 0},
            {id: 'reset', sortOrder: null},
            {id: 'never-placed'},
        ]);

        expect(placed.map(chat => chat.id)).toEqual(['pinned']);
        expect(unplaced.map(chat => chat.id)).toEqual(['reset', 'never-placed']);
    });

    /* Zero is a real position. A truthiness check here would silently unplace the top row. */
    it('keeps a sortOrder of zero on the placed side', () => {
        expect(partitionPlacedChats([{id: 'top', sortOrder: 0}]).placed).toHaveLength(1);
    });

    it('preserves response order and does not sort by the stored values', () => {
        const {placed} = partitionPlacedChats([
            {id: 'first', sortOrder: 0},
            {id: 'second', sortOrder: 1},
            {id: 'third-after-a-gap', sortOrder: 3},
        ]);

        expect(placed.map(chat => chat.id)).toEqual(['first', 'second', 'third-after-a-gap']);
    });

    it('reads the group-scoped column when it is asked to', () => {
        const chats = [
            {id: 'pinned-in-group', sortOrder: null, groupSortOrder: 0},
            {id: 'pinned-in-list', sortOrder: 0, groupSortOrder: null},
        ];

        expect(partitionPlacedChats(chats, 'groupSortOrder').placed.map(chat => chat.id))
            .toEqual(['pinned-in-group']);
        expect(partitionPlacedChats(chats).placed.map(chat => chat.id)).toEqual(['pinned-in-list']);
    });
});

describe('applyOrderMove', () => {
    function groupChats() {
        return [
            {id: 'pinned-a', groupSortOrder: 0, timestamp: '2026-08-01T10:00:00.000-06:00'},
            {id: 'pinned-b', groupSortOrder: 1, timestamp: '2026-08-01T09:00:00.000-06:00'},
            {id: 'dated-new', groupSortOrder: null, timestamp: '2026-08-01T08:00:00.000-06:00'},
            {id: 'dated-old', groupSortOrder: null, timestamp: '2026-07-31T08:00:00.000-06:00'},
        ];
    }

    it('moves a placed chat to the head of the placed prefix', () => {
        const moved = applyOrderMove(groupChats(), 'pinned-b', 0, 'groupSortOrder');

        expect(moved.map(chat => chat.id)).toEqual(['pinned-b', 'pinned-a', 'dated-new', 'dated-old']);
    });

    it('places an unplaced chat, taking it out of the dated tail', () => {
        const moved = applyOrderMove(groupChats(), 'dated-old', 0, 'groupSortOrder');

        expect(moved.map(chat => chat.id)).toEqual(['dated-old', 'pinned-a', 'pinned-b', 'dated-new']);
        expect(moved[0].groupSortOrder).toBe(0);
    });

    it('appends rather than failing when the position is past the end of the placed prefix', () => {
        const moved = applyOrderMove(groupChats(), 'dated-new', 99, 'groupSortOrder');

        expect(moved.map(chat => chat.id)).toEqual(['pinned-a', 'pinned-b', 'dated-new', 'dated-old']);
        expect(moved[2].groupSortOrder).toBe(2);
    });

    it('unplaces on a null position and returns the chat to timestamp order', () => {
        const moved = applyOrderMove(groupChats(), 'pinned-a', null, 'groupSortOrder');

        /* pinned-a is the newest of the three, so it lands at the head of the dated tail. */
        expect(moved.map(chat => chat.id)).toEqual(['pinned-b', 'pinned-a', 'dated-new', 'dated-old']);
        expect(moved.find(chat => chat.id === 'pinned-a').groupSortOrder).toBeNull();
    });

    it('touches only the field it was given', () => {
        const chats = [{id: 'chat-1', sortOrder: 7, groupSortOrder: null, timestamp: 1}];
        const moved = applyOrderMove(chats, 'chat-1', 0, 'groupSortOrder');

        expect(moved[0].sortOrder).toBe(7);
        expect(moved[0].groupSortOrder).toBe(0);
    });

    it('leaves the list alone for a chat it does not hold', () => {
        const chats = groupChats();

        expect(applyOrderMove(chats, 'missing', 0, 'groupSortOrder')).toBe(chats);
    });
});

describe('applyRankMove', () => {
    function arrangedGroups() {
        return [
            {id: 'group-1', name: 'Work', sortOrder: 0},
            {id: 'group-2', name: 'Personal', sortOrder: 1},
            {id: 'group-3', name: 'Reading', sortOrder: 2},
        ];
    }

    it('moves an item to the index it was dropped at', () => {
        const ranked = applyRankMove(arrangedGroups(), 'group-3', 0);

        expect(ranked.map(group => group.id)).toEqual(['group-3', 'group-1', 'group-2']);
    });

    /* Every item carries a rank afterwards, which is what makes the arrangement unambiguous. */
    it('renumbers the whole list from zero, unplaced items included', () => {
        const groups = [
            {id: 'group-1', name: 'Work', sortOrder: null},
            {id: 'group-2', name: 'Personal', sortOrder: null},
            {id: 'group-3', name: 'Reading', sortOrder: null},
        ];

        const ranked = applyRankMove(groups, 'group-3', 1);

        expect(ranked.map(group => [group.id, group.sortOrder])).toEqual([
            ['group-1', 0],
            ['group-3', 1],
            ['group-2', 2],
        ]);
    });

    it('clamps a position past the end of the list', () => {
        const ranked = applyRankMove(arrangedGroups(), 'group-1', 99);

        expect(ranked.map(group => group.id)).toEqual(['group-2', 'group-3', 'group-1']);
        expect(ranked[2].sortOrder).toBe(2);
    });

    it('touches only the field it was given', () => {
        const ranked = applyRankMove(
            [{id: 'group-1', name: 'Work', sortOrder: 7, groupSortOrder: 4}],
            'group-1',
            0,
        );

        expect(ranked[0].sortOrder).toBe(0);
        expect(ranked[0].groupSortOrder).toBe(4);
        expect(ranked[0].name).toBe('Work');
    });

    it('leaves the list alone for an item it does not hold', () => {
        const groups = arrangedGroups();

        expect(applyRankMove(groups, 'missing', 0)).toBe(groups);
    });
});

describe('changedRanks', () => {
    it('answers only the items whose rank the renumbering moved', () => {
        const previousGroups = [
            {id: 'group-1', sortOrder: 0},
            {id: 'group-2', sortOrder: 1},
            {id: 'group-3', sortOrder: 2},
        ];

        const nextGroups = applyRankMove(previousGroups, 'group-2', 0);

        expect(changedRanks(previousGroups, nextGroups).map(group => group.id))
            .toEqual(['group-2', 'group-1']);
    });

    /* Rank zero is a real rank; reading it as unplaced would drop the one group that moved. */
    it('treats a rank of zero as different from no rank at all', () => {
        const previousGroups = [{id: 'group-1', sortOrder: null}];
        const nextGroups = [{id: 'group-1', sortOrder: 0}];

        expect(changedRanks(previousGroups, nextGroups)).toHaveLength(1);
    });

    it('answers nothing when the renumbering changed nothing', () => {
        const groups = [{id: 'group-1', sortOrder: 0}, {id: 'group-2', sortOrder: 1}];

        expect(changedRanks(groups, applyRankMove(groups, 'group-1', 0))).toEqual([]);
    });
});
