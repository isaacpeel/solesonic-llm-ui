import {describe, it, expect} from 'vitest';
import {
    DROP_AFTER,
    DROP_BEFORE,
    DROP_ONTO,
    NEW_GROUP_DROP_ATTRIBUTE,
    autoScrollStep,
    dropEdgeForRow,
    dropPosition,
    dropTargetFromElement,
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

    /*
     * Dragging an arranged conversation down onto a dated one takes it out of the arrangement. It
     * is the only gesture that un-arranges anything.
     */
    it('carries no position when an arranged conversation lands on a dated one', () => {
        expect(dropPosition(chatsOf('chat-a', 'chat-b'), 'chat-a', 'chat-dated', DROP_BEFORE)).toBeNull();
    });

    /*
     * The regression that made every drag inert on a list nobody had arranged yet: the drop
     * resolved, drew its indicator, and then did nothing at all.
     */
    it('arranges a dated conversation dropped onto another dated one', () => {
        expect(dropPosition([], 'chat-z', 'chat-dated', DROP_BEFORE)).toBe(0);
        expect(dropPosition(undefined, 'chat-z', 'chat-dated', DROP_BEFORE)).toBe(0);
    });

    it('joins the foot of an arrangement that already exists', () => {
        expect(dropPosition(chatsOf('chat-a', 'chat-b'), 'chat-z', 'chat-dated', DROP_BEFORE)).toBe(2);
    });

    /* The dated region sits below the whole arrangement, so neither edge of it aims anywhere else. */
    it('answers the same for both edges of a dated conversation', () => {
        const placed = chatsOf('chat-a');

        expect(dropPosition(placed, 'chat-z', 'chat-dated', DROP_BEFORE))
            .toBe(dropPosition(placed, 'chat-z', 'chat-dated', DROP_AFTER));
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

describe('dropTargetFromElement', () => {
    /*
     * Deliberately not jsdom-dependent beyond `closest`: what is being tested is the walk up from
     * whatever the hit test landed on — a label, an icon — to the thing that can be dropped on.
     */
    function elementIn(html) {
        const host = document.createElement('div');
        host.innerHTML = html;

        return host;
    }

    it('walks up from whatever was hit to the row it belongs to', () => {
        const host = elementIn('<div data-index="4"><span class="chat-item-label">Q3</span></div>');
        const label = host.querySelector('.chat-item-label');

        expect(dropTargetFromElement(label)).toEqual({rowElement: host.firstElementChild, rowIndex: 4});
    });

    it('recognises the row itself', () => {
        const host = elementIn('<div data-index="0"></div>');

        expect(dropTargetFromElement(host.firstElementChild).rowIndex).toBe(0);
    });

    it('recognises the new-group button, which has no row index', () => {
        const host = elementIn(`<button ${NEW_GROUP_DROP_ATTRIBUTE}="true"><span>+ New group</span></button>`);

        expect(dropTargetFromElement(host.querySelector('span'))).toEqual({newGroup: true});
    });

    /* The row menu is portalled onto document.body, so it is over the drawer but not part of it. */
    it('is not a target for anything outside a row', () => {
        const host = elementIn('<div class="chat-row-menu"><button>Rename</button></div>');

        expect(dropTargetFromElement(host.querySelector('button'))).toBeNull();
        expect(dropTargetFromElement(null)).toBeNull();
        expect(dropTargetFromElement(undefined)).toBeNull();
    });
});

describe('autoScrollStep', () => {
    const scrollRectangle = {top: 100, bottom: 500, height: 400};

    it('holds still in the middle of the box', () => {
        expect(autoScrollStep(300, scrollRectangle)).toBe(0);
    });

    it('creeps up inside the top zone and down inside the bottom zone', () => {
        expect(autoScrollStep(120, scrollRectangle)).toBeLessThan(0);
        expect(autoScrollStep(480, scrollRectangle)).toBeGreaterThan(0);
    });

    /* Ramped, so a finger resting just inside the edge nudges the list rather than throwing it. */
    it('speeds up the deeper into the zone the pointer is', () => {
        const shallow = Math.abs(autoScrollStep(140, scrollRectangle));
        const deep = Math.abs(autoScrollStep(105, scrollRectangle));

        expect(deep).toBeGreaterThan(shallow);
    });

    it('runs at full speed once the pointer leaves the box', () => {
        const atTheEdge = Math.abs(autoScrollStep(101, scrollRectangle));

        expect(Math.abs(autoScrollStep(20, scrollRectangle))).toBeGreaterThanOrEqual(atTheEdge);
        expect(autoScrollStep(20, scrollRectangle)).toBeLessThan(0);
        expect(autoScrollStep(900, scrollRectangle)).toBeGreaterThan(0);
    });

    it('holds still for a box that has not been measured', () => {
        expect(autoScrollStep(300, {top: 0, bottom: 0, height: 0})).toBe(0);
        expect(autoScrollStep(300, null)).toBe(0);
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
