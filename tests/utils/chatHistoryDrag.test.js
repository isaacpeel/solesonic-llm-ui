import {describe, it, expect} from 'vitest';
import {
    DROP_AFTER,
    DROP_BEFORE,
    DROP_ONTO,
    dropEdgeForRow,
    dropPosition,
    isNoOpDrop,
    resolveDropDestination,
} from '../../src/util/chatHistoryDrag.js';
import {
    CHAT_GROUP_EMPTY_ROW,
    CHAT_GROUP_HEADER_ROW,
    CHAT_GROUP_LOAD_MORE_ROW,
    CHAT_HISTORY_CHAT_ROW,
    CHAT_HISTORY_HEADER_ROW,
} from '../../src/util/chatHistoryRows.js';

function chatRow(chatId, chatGroupId = null) {
    return {type: CHAT_HISTORY_CHAT_ROW, key: `chat:${chatId}`, chatId, chatGroupId};
}

function rectangleOf(top, height) {
    return {top, height, bottom: top + height, left: 0, right: 250, width: 250};
}

function chatsOf(...chatIds) {
    return chatIds.map(chatId => ({id: chatId}));
}

/* Every destination in these tests is the one list, so the callback ignores its argument. */
function placedChatsFrom(placedChats) {
    return () => placedChats;
}

describe('dropEdgeForRow', () => {
    it('reads the top half of a conversation row as its leading edge', () => {
        expect(dropEdgeForRow(chatRow('chat-1'), 10, rectangleOf(0, 40))).toBe(DROP_BEFORE);
    });

    it('reads the bottom half as its trailing edge', () => {
        expect(dropEdgeForRow(chatRow('chat-1'), 30, rectangleOf(0, 40))).toBe(DROP_AFTER);
    });

    it('measures from the row rather than from the viewport', () => {
        expect(dropEdgeForRow(chatRow('chat-1'), 210, rectangleOf(200, 40))).toBe(DROP_BEFORE);
        expect(dropEdgeForRow(chatRow('chat-1'), 230, rectangleOf(200, 40))).toBe(DROP_AFTER);
    });

    it('falls back to the leading edge for a row that has not been measured', () => {
        expect(dropEdgeForRow(chatRow('chat-1'), 10, rectangleOf(0, 0))).toBe(DROP_BEFORE);
    });

    it('treats every other row type as a whole target', () => {
        const rows = [
            {type: CHAT_HISTORY_HEADER_ROW},
            {type: CHAT_GROUP_HEADER_ROW},
            {type: CHAT_GROUP_EMPTY_ROW},
            {type: CHAT_GROUP_LOAD_MORE_ROW},
        ];

        for (const row of rows) {
            expect(dropEdgeForRow(row, 10, rectangleOf(0, 40))).toBe(DROP_ONTO);
        }
    });
});

describe('dropPosition', () => {
    it('counts the index with the dragged conversation taken out', () => {
        const placed = chatsOf('chat-a', 'chat-b', 'chat-c');

        expect(dropPosition(placed, 'chat-a', 'chat-b', DROP_AFTER)).toBe(1);
        expect(dropPosition(placed, 'chat-a', 'chat-c', DROP_AFTER)).toBe(2);
        expect(dropPosition(placed, 'chat-c', 'chat-a', DROP_BEFORE)).toBe(0);
    });

    it('counts a conversation arriving from elsewhere against the whole placed list', () => {
        const placed = chatsOf('chat-a', 'chat-b');

        expect(dropPosition(placed, 'chat-z', 'chat-b', DROP_BEFORE)).toBe(1);
        expect(dropPosition(placed, 'chat-z', 'chat-b', DROP_AFTER)).toBe(2);
    });

    /* A conversation still in date order is not at any index, so there is nothing to anchor to. */
    it('carries no position when the target is not itself placed', () => {
        expect(dropPosition(chatsOf('chat-a'), 'chat-z', 'chat-dated', DROP_BEFORE)).toBeNull();
    });

    it('carries no position when nothing has been placed at all', () => {
        expect(dropPosition([], 'chat-z', 'chat-a', DROP_BEFORE)).toBeNull();
        expect(dropPosition(undefined, 'chat-z', 'chat-a', DROP_BEFORE)).toBeNull();
    });
});

describe('resolveDropDestination', () => {
    const placedChatsFor = placedChatsFrom(chatsOf('chat-a', 'chat-b'));

    it('files into the group a group header stands for, without a position', () => {
        const row = {type: CHAT_GROUP_HEADER_ROW, chatGroupId: 'group-1'};

        expect(resolveDropDestination(row, DROP_ONTO, {draggedChatId: 'chat-z', placedChatsFor}))
            .toEqual({chatGroupId: 'group-1', position: null});
    });

    it('files into the group an empty or load-more row belongs to', () => {
        const emptyRow = {type: CHAT_GROUP_EMPTY_ROW, chatGroupId: 'group-1'};
        const loadMoreRow = {type: CHAT_GROUP_LOAD_MORE_ROW, chatGroupId: 'group-1'};

        expect(resolveDropDestination(emptyRow, DROP_ONTO, {draggedChatId: 'chat-z', placedChatsFor}))
            .toEqual({chatGroupId: 'group-1', position: null});
        expect(resolveDropDestination(loadMoreRow, DROP_ONTO, {draggedChatId: 'chat-z', placedChatsFor}))
            .toEqual({chatGroupId: 'group-1', position: null});
    });

    it('returns a conversation to date order when it lands on a day header', () => {
        const row = {type: CHAT_HISTORY_HEADER_ROW, placedSection: false};

        expect(resolveDropDestination(row, DROP_ONTO, {draggedChatId: 'chat-z', placedChatsFor}))
            .toEqual({chatGroupId: null, position: null});
    });

    /* "No place" would mean nothing on the header of the placed region itself. */
    it('sends a conversation to the top of the arrangement when it lands on the Arranged header', () => {
        const row = {type: CHAT_HISTORY_HEADER_ROW, placedSection: true};

        expect(resolveDropDestination(row, DROP_ONTO, {draggedChatId: 'chat-z', placedChatsFor}))
            .toEqual({chatGroupId: null, position: 0});
    });

    it('reads the destination group off the conversation row it lands on', () => {
        const row = chatRow('chat-b', 'group-1');
        const groupPlaced = placedChatsFrom(chatsOf('chat-a', 'chat-b'));

        expect(resolveDropDestination(row, DROP_BEFORE, {draggedChatId: 'chat-z', placedChatsFor: groupPlaced}))
            .toEqual({chatGroupId: 'group-1', position: 1});
    });

    it('is not a drop target when the conversation lands on its own row', () => {
        expect(resolveDropDestination(chatRow('chat-a'), DROP_BEFORE, {draggedChatId: 'chat-a', placedChatsFor}))
            .toBeNull();
    });

    it('is not a drop target without a row or without something being dragged', () => {
        expect(resolveDropDestination(null, DROP_BEFORE, {draggedChatId: 'chat-a', placedChatsFor})).toBeNull();
        expect(resolveDropDestination(chatRow('chat-a'), DROP_BEFORE, {draggedChatId: null, placedChatsFor}))
            .toBeNull();
    });
});

describe('isNoOpDrop', () => {
    const placed = chatsOf('chat-a', 'chat-b', 'chat-c');

    it('recognises a drop that leaves every conversation where it was', () => {
        expect(isNoOpDrop(placed, 'chat-a', 0)).toBe(true);
        expect(isNoOpDrop(placed, 'chat-b', 1)).toBe(true);
        expect(isNoOpDrop(placed, 'chat-c', 2)).toBe(true);
    });

    it('recognises a drop that actually moves something', () => {
        expect(isNoOpDrop(placed, 'chat-a', 1)).toBe(false);
        expect(isNoOpDrop(placed, 'chat-c', 0)).toBe(false);
    });

    /* Unplacing a placed conversation changes the list even though it carries no index. */
    it('treats unplacing a placed conversation as a real move', () => {
        expect(isNoOpDrop(placed, 'chat-b', null)).toBe(false);
    });

    it('treats leaving an unplaced conversation unplaced as no move at all', () => {
        expect(isNoOpDrop(placed, 'chat-dated', null)).toBe(true);
        expect(isNoOpDrop(placed, 'chat-dated', 0)).toBe(false);
    });
});
