import {describe, it, expect} from 'vitest';
import {
    normalizeSearchQuery,
    splitHighlight,
    splitLabelHighlight,
} from '../../src/util/chatHistorySearch.js';
import {flattenSearchResultsToRows, estimateChatHistoryRowSize} from '../../src/util/chatHistoryRows.js';

describe('chatHistorySearch', () => {
    it('treats blank and one-character input as no search', () => {
        expect(normalizeSearchQuery('')).toBeNull();
        expect(normalizeSearchQuery('   ')).toBeNull();
        expect(normalizeSearchQuery(' a ')).toBeNull();
        expect(normalizeSearchQuery(undefined)).toBeNull();
    });

    it('trims a query of two or more characters and caps it at 200', () => {
        expect(normalizeSearchQuery('  unif ')).toBe('unif');
        expect(normalizeSearchQuery('x'.repeat(250))).toHaveLength(200);
    });

    it('splits a snippet on the server offsets exactly as given', () => {
        const snippet = '…set up the unifi POE switch…';

        expect(splitHighlight(snippet, 12, 5)).toEqual({
            before: '…set up the ',
            match: 'unifi',
            after: ' POE switch…',
        });
    });

    it('falls back to no highlight when the range is out of bounds', () => {
        expect(splitHighlight('short', 3, 10)).toEqual({before: 'short', match: '', after: ''});
        expect(splitHighlight('short', null, null)).toEqual({before: 'short', match: '', after: ''});
    });

    it('finds a name match ignoring case', () => {
        expect(splitLabelHighlight('UniFi network rebuild', 'unif')).toEqual({
            before: '',
            match: 'UniF',
            after: 'i network rebuild',
        });

        expect(splitLabelHighlight('Sourdough', 'banff').match).toBe('');
    });

    it('builds result rows that keep the chat group and the match', () => {
        const match = {chatMessageId: 'message-1', snippet: 'unifi', highlightStart: 0, highlightLength: 5};
        const rows = flattenSearchResultsToRows([
            {key: '2026-10-29', label: 'Today', chats: [
                {id: 'chat-1', name: 'One', chatGroupId: 'group-1', match},
                {id: 'chat-2', name: 'Two', match: null},
            ]},
        ]);

        expect(rows.map(row => row.key)).toEqual(['searchHeader:2026-10-29', 'searchResult:chat-1', 'searchResult:chat-2']);
        expect(rows[1].chatGroupId).toBe('group-1');
        expect(rows[1].match).toBe(match);
        expect(rows[2].chatGroupId).toBeNull();
        expect(estimateChatHistoryRowSize(rows[1])).toBeGreaterThan(estimateChatHistoryRowSize(rows[2]));
    });
});
