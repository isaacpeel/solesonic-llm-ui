import {describe, it, expect} from 'vitest';
import {
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

    it('returns no rows for empty or missing input', () => {
        expect(flattenChatGroupsToRows([])).toEqual([]);
        expect(flattenChatGroupsToRows(undefined)).toEqual([]);
        expect(flattenChatGroupsToRows(null)).toEqual([]);
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
});
