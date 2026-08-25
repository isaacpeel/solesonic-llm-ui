import {describe, it, expect} from 'vitest';
import {
    CHAT_GROUP_EMPTY_ROW,
    CHAT_GROUP_HEADER_ROW,
    CHAT_GROUP_LOAD_MORE_ROW,
    CHAT_HISTORY_CHAT_ROW,
    CHAT_HISTORY_HEADER_ROW,
    chatHistoryRowFullLabel,
    chatHistoryRowLabel,
    estimateChatHistoryRowSize,
    flattenChatGroupsToRows,
} from '../../src/util/chatHistoryRows.js';

function chatOf(chatId, message = undefined, name = null) {
    return {
        id: chatId,
        name,
        chatMessages: message === undefined ? [] : [{message}],
    };
}

function groupOf(key, label, chats) {
    return {key, label, date: null, chats};
}

function chatGroupOf(chatGroupId, label, chats, overrides = {}) {
    return {chatGroupId, label, chats, expanded: true, ...overrides};
}

describe('chatHistoryRowLabel', () => {
    it('uses the first message of the chat', () => {
        expect(chatHistoryRowLabel(chatOf('chat-1', 'Hello there'))).toBe('Hello there');
    });

    it('truncates a message that would wrap the drawer', () => {
        const label = chatHistoryRowLabel(chatOf('chat-1', 'a'.repeat(80)));

        expect(label).toBe('a'.repeat(25) + '...');
    });

    it('keeps a message that is exactly at the limit intact', () => {
        const label = chatHistoryRowLabel(chatOf('chat-1', 'b'.repeat(25)));

        expect(label).toBe('b'.repeat(25));
    });

    it('falls back when the chat has no messages', () => {
        expect(chatHistoryRowLabel(chatOf('chat-1'))).toBe('No messages yet');
    });

    it('falls back when the first message is empty', () => {
        expect(chatHistoryRowLabel(chatOf('chat-1', ''))).toBe('No messages yet');
    });

    it('falls back when the chat itself is missing', () => {
        expect(chatHistoryRowLabel(undefined)).toBe('No messages yet');
    });

    it('prefers the name the user gave the chat over its first message', () => {
        expect(chatHistoryRowLabel(chatOf('chat-1', 'Hello there', 'Trip planning'))).toBe('Trip planning');
    });

    it('falls through to the first message when the name is blank', () => {
        expect(chatHistoryRowLabel(chatOf('chat-1', 'Hello there', '   '))).toBe('Hello there');
    });

    it('falls through to "No messages yet" when there is neither a name nor a message', () => {
        expect(chatHistoryRowLabel(chatOf('chat-1', undefined, null))).toBe('No messages yet');
    });

    it('truncates a name that would wrap the drawer', () => {
        const label = chatHistoryRowLabel(chatOf('chat-1', 'Hello there', 'n'.repeat(40)));

        expect(label).toBe('n'.repeat(25) + '...');
    });
});

describe('chatHistoryRowFullLabel', () => {
    it('returns the whole name, untruncated', () => {
        const name = 'n'.repeat(40);

        expect(chatHistoryRowFullLabel(chatOf('chat-1', 'Hello there', name))).toBe(name);
    });

    it('returns the whole first message when the chat has no name', () => {
        const message = 'm'.repeat(40);

        expect(chatHistoryRowFullLabel(chatOf('chat-1', message))).toBe(message);
    });

    it('trims the stored name', () => {
        expect(chatHistoryRowFullLabel(chatOf('chat-1', 'Hello there', '  Trip planning  '))).toBe('Trip planning');
    });
});

describe('flattenChatGroupsToRows', () => {
    it('emits a header row followed by that group\'s chat rows, in order', () => {
        const rows = flattenChatGroupsToRows([
            groupOf('2026-08-03', 'Today', [chatOf('chat-1', 'first'), chatOf('chat-2', 'second')]),
            groupOf('2026-08-02', 'Yesterday', [chatOf('chat-3', 'third')]),
        ]);

        expect(rows.map(row => row.type)).toEqual([
            CHAT_HISTORY_HEADER_ROW,
            CHAT_HISTORY_CHAT_ROW,
            CHAT_HISTORY_CHAT_ROW,
            CHAT_HISTORY_HEADER_ROW,
            CHAT_HISTORY_CHAT_ROW,
        ]);

        expect(rows.map(row => row.label)).toEqual(['Today', 'first', 'second', 'Yesterday', 'third']);
        expect(rows.filter(row => row.type === CHAT_HISTORY_CHAT_ROW).map(row => row.chatId))
            .toEqual(['chat-1', 'chat-2', 'chat-3']);
    });

    it('marks only the very first header as first in the list', () => {
        const rows = flattenChatGroupsToRows([
            groupOf('2026-08-03', 'Today', [chatOf('chat-1', 'first')]),
            groupOf('2026-08-02', 'Yesterday', [chatOf('chat-2', 'second')]),
        ]);

        const headerRows = rows.filter(row => row.type === CHAT_HISTORY_HEADER_ROW);

        expect(headerRows.map(row => row.firstInList)).toEqual([true, false]);
    });

    it('keys rows so an append does not reuse a key for a different row', () => {
        const firstPageRows = flattenChatGroupsToRows([
            groupOf('2026-08-03', 'Today', [chatOf('chat-1', 'first')]),
        ]);

        const bothPagesRows = flattenChatGroupsToRows([
            groupOf('2026-08-03', 'Today', [chatOf('chat-0', 'newer'), chatOf('chat-1', 'first')]),
        ]);

        /* chat-1 moved from index 1 to index 2, but keeps the key that carries its measurement. */
        expect(firstPageRows[1].key).toBe('chat:chat-1');
        expect(bothPagesRows[2].key).toBe('chat:chat-1');
        expect(new Set(bothPagesRows.map(row => row.key)).size).toBe(bothPagesRows.length);
    });

    it('carries the untruncated label and the chat itself onto every chat row', () => {
        const longName = 'n'.repeat(40);
        const namedChat = chatOf('chat-1', 'first', longName);

        const rows = flattenChatGroupsToRows([groupOf('2026-08-03', 'Today', [namedChat])]);
        const chatRow = rows[1];

        expect(chatRow.label).toBe('n'.repeat(25) + '...');
        expect(chatRow.fullLabel).toBe(longName);
        expect(chatRow.chat).toBe(namedChat);
    });

    it('emits a header for a group that has no chats', () => {
        const rows = flattenChatGroupsToRows([groupOf('2026-08-03', 'Today', [])]);

        expect(rows).toHaveLength(1);
        expect(rows[0].type).toBe(CHAT_HISTORY_HEADER_ROW);
    });

    it('contributes a header row and nothing else for a day that has been collapsed', () => {
        const rows = flattenChatGroupsToRows([
            {...groupOf('2026-08-03', 'Today', [chatOf('chat-1', 'first')]), expanded: false},
        ]);

        expect(rows).toHaveLength(1);
        expect(rows[0].type).toBe(CHAT_HISTORY_HEADER_ROW);
        expect(rows[0].expanded).toBe(false);
    });

    /* Only a day the user has closed says anything about it, so silence has to mean open. */
    it('treats a day that says nothing about it as open', () => {
        const rows = flattenChatGroupsToRows([groupOf('2026-08-03', 'Today', [chatOf('chat-1', 'first')])]);

        expect(rows).toHaveLength(2);
        expect(rows[0].expanded).toBe(true);
    });

    it('carries the day key onto its header, so a collapse can name the day', () => {
        const rows = flattenChatGroupsToRows([groupOf('2026-08-03', 'Today', [])]);

        expect(rows[0].dayKey).toBe('2026-08-03');
    });

    it('returns no rows for empty or missing input', () => {
        expect(flattenChatGroupsToRows([])).toEqual([]);
        expect(flattenChatGroupsToRows(undefined)).toEqual([]);
        expect(flattenChatGroupsToRows(null)).toEqual([]);
    });
});

describe('flattenChatGroupsToRows with conversation groups', () => {
    it('emits a group header followed by the conversations under it, in order', () => {
        const rows = flattenChatGroupsToRows([
            chatGroupOf('group-1', 'Work', [chatOf('chat-1', 'first'), chatOf('chat-2', 'second')]),
        ]);

        expect(rows.map(row => row.type)).toEqual([
            CHAT_GROUP_HEADER_ROW,
            CHAT_HISTORY_CHAT_ROW,
            CHAT_HISTORY_CHAT_ROW,
        ]);
        expect(rows[0].label).toBe('Work');
        expect(rows.slice(1).map(row => row.chatId)).toEqual(['chat-1', 'chat-2']);
        expect(rows.slice(1).every(row => row.chatGroupId === 'group-1')).toBe(true);
    });

    it('contributes a header row and nothing else while the group is collapsed', () => {
        const rows = flattenChatGroupsToRows([
            chatGroupOf('group-1', 'Work', [chatOf('chat-1', 'first')], {expanded: false, hasMore: true}),
        ]);

        expect(rows).toHaveLength(1);
        expect(rows[0].type).toBe(CHAT_GROUP_HEADER_ROW);
        expect(rows[0].expanded).toBe(false);
    });

    it('renders one empty row for an expanded group with nothing in it', () => {
        const rows = flattenChatGroupsToRows([chatGroupOf('group-1', 'Work', [])]);

        expect(rows.map(row => row.type)).toEqual([CHAT_GROUP_HEADER_ROW, CHAT_GROUP_EMPTY_ROW]);
        expect(rows[1].label).toBe('No conversations yet.');
    });

    /* While the first page is still in flight the group is not empty, it is unknown. */
    it('does not call a loading group empty', () => {
        const rows = flattenChatGroupsToRows([
            chatGroupOf('group-1', 'Work', [], {loading: true, hasMore: true}),
        ]);

        expect(rows.map(row => row.type)).toEqual([CHAT_GROUP_HEADER_ROW, CHAT_GROUP_LOAD_MORE_ROW]);
        expect(rows[1].label).toBe('Loading…');
    });

    it('closes a group that has more pages with a load-more row', () => {
        const rows = flattenChatGroupsToRows([
            chatGroupOf('group-1', 'Work', [chatOf('chat-1', 'first')], {hasMore: true}),
        ]);

        expect(rows.map(row => row.type)).toEqual([
            CHAT_GROUP_HEADER_ROW,
            CHAT_HISTORY_CHAT_ROW,
            CHAT_GROUP_LOAD_MORE_ROW,
        ]);
        expect(rows[2].label).toBe('Load more');
        expect(rows[2].chatGroupId).toBe('group-1');
    });

    it('carries the count only once one has been reported', () => {
        const withoutCount = flattenChatGroupsToRows([chatGroupOf('group-1', 'Work', [])]);
        const withCount = flattenChatGroupsToRows([chatGroupOf('group-1', 'Work', [], {count: 3})]);

        expect(withoutCount[0].count).toBeNull();
        expect(withCount[0].count).toBe(3);
    });

    it('renders group sections above the day buckets and spaces the first day header', () => {
        const rows = flattenChatGroupsToRows([
            chatGroupOf('group-1', 'Work', [chatOf('chat-1', 'grouped')]),
            groupOf('2026-08-03', 'Today', [chatOf('chat-2', 'loose')]),
        ]);

        expect(rows.map(row => row.type)).toEqual([
            CHAT_GROUP_HEADER_ROW,
            CHAT_HISTORY_CHAT_ROW,
            CHAT_HISTORY_HEADER_ROW,
            CHAT_HISTORY_CHAT_ROW,
        ]);
        /* The day header is no longer the top of the list, so it keeps its separating padding. */
        expect(rows[2].firstInList).toBe(false);
    });

    it('keys a grouped row apart from the same conversation in the ungrouped list', () => {
        const rows = flattenChatGroupsToRows([
            chatGroupOf('group-1', 'Work', [chatOf('chat-1', 'grouped')]),
            groupOf('2026-08-03', 'Today', [chatOf('chat-1', 'loose')]),
        ]);

        expect(rows[1].key).toBe('groupChat:group-1:chat-1');
        expect(rows[3].key).toBe('chat:chat-1');
        expect(new Set(rows.map(row => row.key)).size).toBe(rows.length);
    });
});

describe('estimateChatHistoryRowSize', () => {
    it('estimates a header taller than a chat row', () => {
        const headerSize = estimateChatHistoryRowSize({type: CHAT_HISTORY_HEADER_ROW});
        const chatSize = estimateChatHistoryRowSize({type: CHAT_HISTORY_CHAT_ROW});

        expect(headerSize).toBeGreaterThan(chatSize);
        expect(chatSize).toBeGreaterThan(0);
    });

    it('falls back to a chat row estimate for an index past the end of the list', () => {
        expect(estimateChatHistoryRowSize(undefined))
            .toBe(estimateChatHistoryRowSize({type: CHAT_HISTORY_CHAT_ROW}));
    });

    /* A wrong estimate makes the scrollbar creep as the list is scrolled, so every type needs one. */
    it('returns a positive number for every group row type', () => {
        const chatSize = estimateChatHistoryRowSize({type: CHAT_HISTORY_CHAT_ROW});

        for (const rowType of [CHAT_GROUP_HEADER_ROW, CHAT_GROUP_EMPTY_ROW, CHAT_GROUP_LOAD_MORE_ROW]) {
            const size = estimateChatHistoryRowSize({type: rowType});

            expect(size).toBeGreaterThan(0);
            /* Group rows are built as one-line boxes with a chat row's padding and separator. */
            expect(size).toBe(chatSize);
        }
    });
});
