import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, fireEvent, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router';

vi.mock('../../src/hooks/usePagedChatHistory.js', () => ({
    default: vi.fn(),
}));

vi.mock('../../src/hooks/useChatGroups.js', () => ({
    default: vi.fn(),
}));

vi.mock('../../src/service/ChatService.js', () => ({
    default: {
        renameChat: vi.fn(),
        deleteChat: vi.fn(),
    },
    DEFAULT_CHAT_HISTORY_PAGE_SIZE: 20,
}));

vi.mock('../../src/service/ChatGroupService.js', () => ({
    default: {
        createGroup: vi.fn(),
        addChatToGroup: vi.fn(),
        removeChatFromGroup: vi.fn(),
        reorderChatInGroup: vi.fn(),
        updateChatGroup: vi.fn(),
        deleteGroup: vi.fn(),
        findGroupChats: vi.fn(),
    },
}));

vi.mock('react-toastify', () => ({
    toast: Object.assign(vi.fn(), {error: vi.fn()}),
    ToastContainer: () => null,
    Bounce: {},
}));

vi.mock('loglevel', () => ({
    default: {error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()},
}));

const navigateSpy = vi.fn();

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal();

    return {...actual, useNavigate: () => navigateSpy};
});

import ChatHistory from '../../src/chat/message/ChatHistory.jsx';
import {toast} from 'react-toastify';
import {SharedDataContext} from '../../src/context/SharedDataContext.jsx';
import usePagedChatHistory from '../../src/hooks/usePagedChatHistory.js';
import useChatGroups from '../../src/hooks/useChatGroups.js';
import chatService from '../../src/service/ChatService.js';
import chatGroupService from '../../src/service/ChatGroupService.js';

const VIEWPORT_HEIGHT = 600;

const ROW_HEIGHT = 41;

/* Matches `.drawer`'s fixed width, which is what the out-of-drawer dead band is measured from. */
const DRAWER_WIDTH = 250;

/*
 * jsdom lays nothing out, so every element reports zero for the metrics @tanstack/virtual-core
 * actually reads — `offsetWidth`/`offsetHeight` (its ResizeObserver path never fires under test;
 * vitest.setup.js stubs the observer as a no-op). Feeding the scroll box and the rows real
 * numbers through those getters is what makes the windowing observable at all.
 */
/*
 * What `document.elementFromPoint` answers with. jsdom lays nothing out, so it can only ever return
 * null on its own; the drag helpers below point it at the row they mean to drop on.
 */
let hitTestElement = null;

function stubLayout() {
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    const originalElementFromPoint = document.elementFromPoint;
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

    hitTestElement = null;
    document.elementFromPoint = function stubbedElementFromPoint() {
        return hitTestElement;
    };

    /*
     * Only the drawer gets a real rectangle — the dead band around it is read from this. Everything
     * else keeps jsdom's zeros on purpose: a measured `.chat-history-scroll` would put
     * `autoScrollStep` above its zero-height guard and start requestAnimationFrame loops under test.
     * Rows that need a rectangle are given one directly by the drag helpers, and an own property
     * wins over this.
     */
    /** @this {Element} */
    Element.prototype.getBoundingClientRect = function stubbedGetBoundingClientRect() {
        if (this.classList?.contains('chat-drawer-container')) {
            return {left: 0, right: DRAWER_WIDTH, top: 0, bottom: VIEWPORT_HEIGHT, width: DRAWER_WIDTH, height: VIEWPORT_HEIGHT};
        }

        return originalGetBoundingClientRect.call(this);
    };

    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        configurable: true,
        get: function stubbedOffsetWidth() {
            return 250;
        },
    });

    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        /** @this {HTMLElement} */
        get: function stubbedOffsetHeight() {
            if (this.classList.contains('chat-history-scroll')) {
                return VIEWPORT_HEIGHT;
            }

            if (this.classList.contains('chat-history-row')) {
                return ROW_HEIGHT;
            }

            return 0;
        },
    });

    return () => {
        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
        document.elementFromPoint = originalElementFromPoint;
        Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
        hitTestElement = null;
    };
}

/*
 * The day header is labelled relative to the current date, so the fixture has to be too — a
 * hardcoded day silently stops being "Today" the day after it is written.
 */
function todayAtMidMorning() {
    const now = new Date();

    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10).toISOString();
}

/* All on one day — and all at the same instant, so the newest-first sort keeps them in id order. */
function chatsOf(count, name = null) {
    const timestamp = todayAtMidMorning();

    return Array.from({length: count}, (unused, index) => ({
        id: `chat-${index}`,
        name,
        timestamp,
        chatMessages: [{message: `Message number ${index}`}],
    }));
}

/* One loaded group section, in the shape `useChatGroups` hands the drawer. */
function groupChatsOf(chats, {last = true, loading = false} = {}) {
    return {chats, page: 0, last, totalElements: chats.length, loading, error: null};
}

function renderChatHistory({
    chats,
    hasMore = true,
    loading = false,
    error,
    groups = [],
    chatsByGroupId = {},
    openChatId = null,
    streamingChatId = null,
} = {}) {
    const loadMore = vi.fn();
    const retry = vi.fn();
    const setChatId = vi.fn();
    const setChatHistory = vi.fn();
    const setReloadHistoryTrigger = vi.fn();
    const setDrawerOpen = vi.fn();
    const replaceChat = vi.fn();
    const removeChat = vi.fn();
    const upsertChat = vi.fn();
    const setChatsDirectly = vi.fn();

    const reloadGroups = vi.fn();
    const setGroupsDirectly = vi.fn();
    const replaceGroups = vi.fn();
    const loadGroupChats = vi.fn();
    const loadMoreGroupChats = vi.fn();
    const reloadGroupChats = vi.fn();
    const replaceGroupChat = vi.fn();
    const removeGroupChat = vi.fn();
    const addGroupChat = vi.fn();
    const setGroupChatsDirectly = vi.fn();

    usePagedChatHistory.mockReturnValue({
        chats,
        loading,
        error: error ?? null,
        hasMore,
        loadMore,
        retry,
        replaceChat,
        removeChat,
        upsertChat,
        setChatsDirectly,
    });

    useChatGroups.mockReturnValue({
        groups,
        groupsLoading: false,
        groupsError: null,
        reloadGroups,
        setGroupsDirectly,
        replaceGroups,
        chatsByGroupId,
        loadGroupChats,
        loadMoreGroupChats,
        reloadGroupChats,
        replaceGroupChat,
        removeGroupChat,
        addGroupChat,
        setGroupChatsDirectly,
    });

    const sharedData = {
        reloadHistoryTrigger: 0,
        chatId: openChatId,
        setChatId,
        setChatHistory,
        streamingChatId,
        chatInputRef: {current: null},
        setReloadHistoryTrigger,
    };

    const renderResult = render(
        <MemoryRouter>
            <SharedDataContext.Provider value={sharedData}>
                <ChatHistory userId="user-1" drawerOpen={true} setDrawerOpen={setDrawerOpen}/>
            </SharedDataContext.Provider>
        </MemoryRouter>
    );

    return {
        ...renderResult,
        loadMore,
        retry,
        setChatId,
        setChatHistory,
        setReloadHistoryTrigger,
        setDrawerOpen,
        replaceChat,
        removeChat,
        upsertChat,
        setChatsDirectly,
        reloadGroups,
        setGroupsDirectly,
        replaceGroups,
        loadGroupChats,
        loadMoreGroupChats,
        reloadGroupChats,
        replaceGroupChat,
        removeGroupChat,
        addGroupChat,
        setGroupChatsDirectly,
    };
}

let restoreLayout;

beforeEach(() => {
    restoreLayout = stubLayout();
    navigateSpy.mockReset();
    usePagedChatHistory.mockReset();
    useChatGroups.mockReset();
    chatService.renameChat.mockReset();
    chatService.renameChat.mockResolvedValue({id: 'chat-0', name: 'Trip planning'});
    chatService.deleteChat.mockReset();
    chatService.deleteChat.mockResolvedValue(null);

    chatGroupService.createGroup.mockReset();
    chatGroupService.addChatToGroup.mockReset();
    chatGroupService.removeChatFromGroup.mockReset();
    chatGroupService.reorderChatInGroup.mockReset();
    chatGroupService.createGroup.mockResolvedValue({id: 'group-new', name: 'Work'});
    chatGroupService.addChatToGroup.mockResolvedValue(null);
    chatGroupService.removeChatFromGroup.mockResolvedValue(null);
    chatGroupService.reorderChatInGroup.mockResolvedValue({id: 'chat-0', groupSortOrder: 0});
    chatGroupService.updateChatGroup.mockReset();
    chatGroupService.updateChatGroup.mockImplementation(async (chatGroup) => ({...chatGroup}));
    chatGroupService.deleteGroup.mockReset();
    chatGroupService.deleteGroup.mockResolvedValue(null);
    chatGroupService.findGroupChats.mockReset();
    chatGroupService.findGroupChats.mockResolvedValue({chats: [], page: 0, last: true, totalElements: 0});
});

afterEach(() => {
    restoreLayout();
    vi.clearAllMocks();
});

describe('ChatHistory virtualization', () => {
    it('mounts only a window of rows for a long list', () => {
        const chatCount = 500;
        const {container} = renderChatHistory({chats: chatsOf(chatCount)});

        const mountedRows = container.querySelectorAll('.chat-item');

        expect(mountedRows.length).toBeGreaterThan(0);
        expect(mountedRows.length).toBeLessThan(chatCount / 4);
    });

    it('sizes the spacer to the whole list, not to the mounted window', () => {
        const {container} = renderChatHistory({chats: chatsOf(500)});

        const spacerHeight = Number.parseFloat(container.querySelector('.chat-history-spacer').style.height);

        expect(spacerHeight).toBeGreaterThan(VIEWPORT_HEIGHT * 10);
    });

    it('renders the day header above its chats', () => {
        const {container} = renderChatHistory({chats: chatsOf(5)});

        expect(container.querySelector('.date-header').textContent).toBe('Today');
        expect(container.querySelectorAll('.chat-item')).toHaveLength(5);
    });

    it('does not space the first header away from the top of the list', () => {
        const {container} = renderChatHistory({chats: chatsOf(3)});

        const headerRow = container.querySelector('.chat-history-header-row');

        expect(headerRow.classList.contains('chat-history-header-row-spaced')).toBe(false);
    });

    it('truncates a long message onto one row', () => {
        const chats = [{
            id: 'chat-long',
            timestamp: '2026-08-03T10:00:00.000-06:00',
            chatMessages: [{message: 'x'.repeat(90)}],
        }];

        const {container} = renderChatHistory({chats});

        expect(container.querySelector('.chat-item').textContent).toBe('x'.repeat(25) + '...');
    });
});

/*
 * A day bucket collapses the way a conversation group does, but starts the other way round: a group
 * is closed until it is opened, because opening it is what fetches its page, while a day holds
 * conversations that are already here.
 */
describe('ChatHistory collapsing a day', () => {
    function chatsAcrossTwoDays() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10).toISOString();
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 10).toISOString();

        return [
            {id: 'chat-today', name: null, timestamp: today, chatMessages: [{message: 'Today message'}]},
            {id: 'chat-yesterday', name: null, timestamp: yesterday, chatMessages: [{message: 'Yesterday message'}]},
        ];
    }

    function dayHeaders(container) {
        return Array.from(container.querySelectorAll('.date-header'));
    }

    function rowLabels(container) {
        return Array.from(container.querySelectorAll('.chat-item-label')).map(label => label.textContent);
    }

    it('opens every day to begin with', () => {
        const {container} = renderChatHistory({chats: chatsOf(3)});

        expect(container.querySelector('.date-header').getAttribute('aria-expanded')).toBe('true');
        expect(container.querySelectorAll('.chat-item')).toHaveLength(3);
    });

    it('takes the day\'s conversations off the list and leaves its header', () => {
        const {container} = renderChatHistory({chats: chatsOf(3)});

        fireEvent.click(container.querySelector('.date-header'));

        expect(container.querySelectorAll('.chat-item')).toHaveLength(0);
        expect(dayHeaders(container)).toHaveLength(1);
        expect(container.querySelector('.date-header').getAttribute('aria-expanded')).toBe('false');
    });

    it('brings them back on the next click', () => {
        const {container} = renderChatHistory({chats: chatsOf(3)});

        fireEvent.click(container.querySelector('.date-header'));
        fireEvent.click(container.querySelector('.date-header'));

        expect(container.querySelectorAll('.chat-item')).toHaveLength(3);
    });

    it('closes only the day that was clicked', () => {
        const {container} = renderChatHistory({chats: chatsAcrossTwoDays()});

        expect(dayHeaders(container).map(header => header.textContent)).toEqual(['Today', 'Yesterday']);

        fireEvent.click(container.querySelectorAll('.date-header')[0]);

        expect(rowLabels(container)).toEqual(['Yesterday message']);
        expect(dayHeaders(container)).toHaveLength(2);
    });
});

describe('ChatHistory infinite scroll', () => {
    it('asks for the next page when the window reaches the end of the list', async () => {
        const {loadMore} = renderChatHistory({chats: chatsOf(3), hasMore: true});

        await waitFor(() => expect(loadMore).toHaveBeenCalled());
    });

    it('does not ask for more once the last page has landed', async () => {
        const {loadMore} = renderChatHistory({chats: chatsOf(3), hasMore: false});

        await waitFor(() => expect(loadMore).not.toHaveBeenCalled());
    });

    it('does not ask for more while the window is far from the end', async () => {
        const {loadMore} = renderChatHistory({chats: chatsOf(500), hasMore: true});

        await waitFor(() => expect(loadMore).not.toHaveBeenCalled());
    });
});

describe('ChatHistory paging feedback', () => {
    it('keeps the retry button outside the virtualized window', () => {
        const {container, retry} = renderChatHistory({
            chats: chatsOf(500),
            error: new Error('boom'),
            hasMore: false,
        });

        const retryButton = container.querySelector('.chat-history-retry');

        expect(container.querySelector('.chat-history-spacer').contains(retryButton)).toBe(false);

        fireEvent.click(retryButton);
        expect(retry).toHaveBeenCalled();
    });

    it('reports an empty history', () => {
        const {container} = renderChatHistory({chats: [], hasMore: false});

        expect(container.querySelector('.chat-history-status').textContent).toBe('No chats yet.');
        expect(container.querySelectorAll('.chat-item')).toHaveLength(0);
    });
});

/* The menu is portalled to document.body, so it is never inside the render container. */
function openRowMenu(container, rowIndex = 0) {
    /* Scoped to conversations: group headers carry a kebab of their own, ahead of these in the list. */
    fireEvent.click(container.querySelectorAll('.chat-item .chat-row-menu-trigger')[rowIndex]);

    return document.body.querySelector('.chat-row-menu');
}

function openGroupMenu(container, groupIndex = 0) {
    fireEvent.click(container.querySelectorAll('.chat-group-header-row .chat-row-menu-trigger')[groupIndex]);

    return document.body.querySelector('.chat-row-menu');
}

function menuItems(menu = document.body.querySelector('.chat-row-menu')) {
    return Array.from(menu?.querySelectorAll('.chat-row-menu-item') ?? []);
}

/* The submenu marker and the check are decorative spans; the label span is the action's name. */
function menuItemLabels(menu) {
    return menuItems(menu).map(item => item.querySelector('.chat-row-menu-item-label').textContent);
}

function clickMenuItem(label) {
    const item = menuItems().find(
        candidate => candidate.querySelector('.chat-row-menu-item-label').textContent === label
    );

    fireEvent.click(item);
}

/*
 * jsdom implements neither `PointerEvent` nor pointer capture, and testing-library's fallback
 * constructor drops the coordinates the drop arithmetic reads. Building the event by hand keeps
 * them — React and the hook's own window listeners both key on the native type, either way.
 */
function pointerEventOf(type, {clientX = 0, clientY = 0} = {}) {
    const event = new Event(type, {bubbles: true, cancelable: true});

    Object.defineProperty(event, 'pointerId', {value: POINTER_ID});
    Object.defineProperty(event, 'clientX', {value: clientX});
    Object.defineProperty(event, 'clientY', {value: clientY});

    return event;
}

const POINTER_ID = 1;

/* Comfortably past the hook's 6px threshold, so the press becomes a drag. */
const PAST_DRAG_THRESHOLD = 40;

const ROW_RECTANGLE = {
    top: 0,
    bottom: ROW_HEIGHT,
    height: ROW_HEIGHT,
    left: 0,
    right: 250,
    width: 250,
    x: 0,
    y: 0,
};

/*
 * Drags the conversation on one row onto another, releasing over the named half of the target.
 * Indices are into `.chat-history-row`, so headers and a group's own rows count — which is the
 * point, since they are drop targets too.
 *
 * The move is dispatched twice: once to carry the pointer past the threshold and start the drag,
 * and once at the coordinate the release actually happens at, which is what settles the edge.
 */
function dragRow(container, fromIndex, toIndex, {edge = 'before'} = {}) {
    const rows = container.querySelectorAll('.chat-history-row');
    const handle = rows[fromIndex].querySelector('.chat-history-drag-handle');
    const target = rows[toIndex];

    target.getBoundingClientRect = () => ROW_RECTANGLE;
    hitTestElement = target;

    const clientY = edge === 'after' ? ROW_HEIGHT - 1 : 1;

    fireEvent(handle, pointerEventOf('pointerdown', {clientY: 0}));
    fireEvent(window, pointerEventOf('pointermove', {clientY: PAST_DRAG_THRESHOLD}));
    fireEvent(window, pointerEventOf('pointermove', {clientY}));
    fireEvent(window, pointerEventOf('pointerup', {clientY}));
}

/* Drags a conversation onto the `+ New group` button, which creates the group around it. */
function dragRowOntoNewGroup(container, fromIndex) {
    const handle = container.querySelectorAll('.chat-history-row')[fromIndex]
        .querySelector('.chat-history-drag-handle');

    hitTestElement = container.querySelector('.chat-history-new-group');

    fireEvent(handle, pointerEventOf('pointerdown', {clientY: 0}));
    fireEvent(window, pointerEventOf('pointermove', {clientY: PAST_DRAG_THRESHOLD}));
    fireEvent(window, pointerEventOf('pointerup', {clientY: PAST_DRAG_THRESHOLD}));
}

/* Presses a grip and moves, without releasing — for asserting on the drag while it is in flight. */
function startDraggingRow(container, fromIndex) {
    const handle = container.querySelectorAll('.chat-history-row')[fromIndex]
        .querySelector('.chat-history-drag-handle');

    fireEvent(handle, pointerEventOf('pointerdown', {clientY: 0}));
    fireEvent(window, pointerEventOf('pointermove', {clientY: PAST_DRAG_THRESHOLD}));
}

/* Holds a conversation over another row without releasing, for asserting on the drop indicator. */
function hoverRowOver(container, fromIndex, toIndex, {edge = 'before'} = {}) {
    const rows = container.querySelectorAll('.chat-history-row');
    const target = rows[toIndex];

    target.getBoundingClientRect = () => ROW_RECTANGLE;
    hitTestElement = target;

    startDraggingRow(container, fromIndex);
    fireEvent(window, pointerEventOf('pointermove', {clientY: edge === 'after' ? ROW_HEIGHT - 1 : 1}));

    return container.querySelector(
        '.chat-history-row-drop-before, .chat-history-row-drop-after, .chat-history-row-drop-onto'
    );
}

function pressDragHandle(container, rowIndex, key) {
    const handle = container.querySelectorAll('.chat-history-row')[rowIndex]
        .querySelector('.chat-history-drag-handle');

    fireEvent.keyDown(handle, {key});
}

function startRename(container, rowIndex = 0) {
    openRowMenu(container, rowIndex);
    fireEvent.click(document.body.querySelector('.chat-row-menu-item'));

    return container.querySelector('.chat-item-rename');
}

describe('ChatHistory row labels', () => {
    it('renders the name the chat was given rather than its first message', () => {
        const {container} = renderChatHistory({chats: chatsOf(1, 'Trip planning')});

        expect(container.querySelector('.chat-item-label').textContent).toBe('Trip planning');
    });

    it('exposes the untruncated label as the row title', () => {
        const longName = 'n'.repeat(40);
        const {container} = renderChatHistory({chats: chatsOf(1, longName)});

        expect(container.querySelector('.chat-item-label').textContent).toBe('n'.repeat(25) + '...');
        expect(container.querySelector('.chat-item').getAttribute('title')).toBe(longName);
    });
});

describe('ChatHistory row actions', () => {
    it('renders a kebab for every chat row', () => {
        const {container} = renderChatHistory({chats: chatsOf(5)});

        expect(container.querySelectorAll('.chat-row-menu-trigger')).toHaveLength(5);
    });

    it('opens the action menu without opening the chat', () => {
        const {container, setChatId, setDrawerOpen} = renderChatHistory({chats: chatsOf(5)});

        const menu = openRowMenu(container, 2);

        expect(menu).not.toBeNull();
        expect(menuItemLabels(menu)).toEqual(['Rename', 'Delete']);
        expect(setChatId).not.toHaveBeenCalled();
        expect(setDrawerOpen).not.toHaveBeenCalled();
        expect(navigateSpy).not.toHaveBeenCalled();
    });

    /* Arranging is a drag gesture; an action that duplicated one is a second source of truth. */
    it('offers nothing that files, unfiles or orders the conversation', () => {
        const {container} = renderExpandedGroup([chatFiledUnder('group-1')]);

        openRowMenu(container, 0);

        expect(menuItemLabels()).toEqual(['Rename', 'Delete']);
    });
});

describe('ChatHistory rename', () => {
    it('seeds the editor with the chat name and the fallback as its placeholder', () => {
        const {container} = renderChatHistory({chats: chatsOf(1, 'Trip planning')});

        const renameInput = startRename(container);

        expect(renameInput).not.toBeNull();
        expect(renameInput.value).toBe('Trip planning');
        expect(renameInput.placeholder).toBe('Message number 0');
        expect(renameInput.maxLength).toBe(255);
    });

    it('leaves the editor empty for a chat that was never named', () => {
        const {container} = renderChatHistory({chats: chatsOf(1)});

        expect(startRename(container).value).toBe('');
    });

    it('commits the trimmed name on Enter, once, and updates the row before the response', async () => {
        const {container, replaceChat} = renderChatHistory({chats: chatsOf(1)});

        const renameInput = startRename(container);
        fireEvent.change(renameInput, {target: {value: '  Trip planning  '}});
        fireEvent.keyDown(renameInput, {key: 'Enter'});

        expect(replaceChat).toHaveBeenCalledWith(expect.objectContaining({id: 'chat-0', name: 'Trip planning'}));

        await waitFor(() => expect(chatService.renameChat).toHaveBeenCalledTimes(1));
        expect(chatService.renameChat).toHaveBeenCalledWith('chat-0', 'Trip planning');
    });

    it('commits on blur', async () => {
        const {container} = renderChatHistory({chats: chatsOf(1)});

        const renameInput = startRename(container);
        fireEvent.change(renameInput, {target: {value: 'Trip planning'}});
        fireEvent.blur(renameInput);

        await waitFor(() => expect(chatService.renameChat).toHaveBeenCalledWith('chat-0', 'Trip planning'));
    });

    it('issues no request on Escape and leaves the label alone', () => {
        const {container, replaceChat} = renderChatHistory({chats: chatsOf(1, 'Trip planning')});

        const renameInput = startRename(container);
        fireEvent.change(renameInput, {target: {value: 'Something else'}});
        fireEvent.keyDown(renameInput, {key: 'Escape'});

        expect(chatService.renameChat).not.toHaveBeenCalled();
        expect(replaceChat).not.toHaveBeenCalled();
        expect(container.querySelector('.chat-item-rename')).toBeNull();
        expect(container.querySelector('.chat-item-label').textContent).toBe('Trip planning');
    });

    it('issues no request for an empty or whitespace-only name', () => {
        const {container} = renderChatHistory({chats: chatsOf(1, 'Trip planning')});

        const renameInput = startRename(container);
        fireEvent.change(renameInput, {target: {value: '   '}});
        fireEvent.keyDown(renameInput, {key: 'Enter'});

        expect(chatService.renameChat).not.toHaveBeenCalled();
        expect(container.querySelector('.chat-item-rename')).toBeNull();
    });

    it('issues no request when the name is unchanged', () => {
        const {container} = renderChatHistory({chats: chatsOf(1, 'Trip planning')});

        const renameInput = startRename(container);
        fireEvent.keyDown(renameInput, {key: 'Enter'});

        expect(chatService.renameChat).not.toHaveBeenCalled();
    });

    it('drops the row when the server says the conversation is gone', async () => {
        chatService.renameChat.mockRejectedValue(Object.assign(new Error('404'), {status: 404}));

        const {container, replaceChat, removeChat} = renderChatHistory({chats: chatsOf(1)});

        const renameInput = startRename(container);
        fireEvent.change(renameInput, {target: {value: 'Trip planning'}});
        fireEvent.keyDown(renameInput, {key: 'Enter'});

        await waitFor(() => expect(removeChat).toHaveBeenCalledWith('chat-0'));
        /* Rolled back to the chat as it was before the optimistic update. */
        expect(replaceChat).toHaveBeenLastCalledWith(expect.objectContaining({id: 'chat-0', name: null}));
    });

    it('re-opens the editor with the attempted name when the server rejects it', async () => {
        chatService.renameChat.mockRejectedValue(Object.assign(new Error('400'), {status: 400}));

        const {container, replaceChat} = renderChatHistory({chats: chatsOf(1)});

        const renameInput = startRename(container);
        fireEvent.change(renameInput, {target: {value: 'Trip planning'}});
        fireEvent.keyDown(renameInput, {key: 'Enter'});

        await waitFor(() => expect(container.querySelector('.chat-item-rename')).not.toBeNull());
        expect(container.querySelector('.chat-item-rename').value).toBe('Trip planning');
        expect(replaceChat).toHaveBeenLastCalledWith(expect.objectContaining({id: 'chat-0', name: null}));
    });

    it('reverts the label on any other failure', async () => {
        chatService.renameChat.mockRejectedValue(Object.assign(new Error('500'), {status: 500}));

        const {container, replaceChat} = renderChatHistory({chats: chatsOf(1)});

        const renameInput = startRename(container);
        fireEvent.change(renameInput, {target: {value: 'Trip planning'}});
        fireEvent.keyDown(renameInput, {key: 'Enter'});

        await waitFor(() => {
            expect(replaceChat).toHaveBeenLastCalledWith(expect.objectContaining({id: 'chat-0', name: null}));
        });

        expect(container.querySelector('.chat-item-rename')).toBeNull();
    });

    it('does not open the chat when the row being edited is clicked', () => {
        const {container, setChatId} = renderChatHistory({chats: chatsOf(1)});

        fireEvent.click(startRename(container));
        fireEvent.click(container.querySelector('.chat-item'));

        expect(setChatId).not.toHaveBeenCalled();
    });
});

describe('ChatHistory selection', () => {
    it('opens the picked chat and closes the drawer', () => {
        const {container, setChatId, setDrawerOpen} = renderChatHistory({chats: chatsOf(5)});

        fireEvent.click(container.querySelectorAll('.chat-item')[2]);

        expect(setChatId).toHaveBeenCalledWith('chat-2');
        expect(setDrawerOpen).toHaveBeenCalledWith(false);
        expect(navigateSpy).toHaveBeenCalledWith('/');
    });
});

const WORK_GROUP = {id: 'group-1', name: 'Work'};

const PERSONAL_GROUP = {id: 'group-2', name: 'Personal'};

function chatFiledUnder(chatGroupId, groupSortOrder = null, index = 0) {
    return {...chatsOf(index + 1)[index], chatGroupId, groupSortOrder};
}

/* Renders a drawer holding one group, and opens it. `chats` seeds the ungrouped list beside it. */
function renderExpandedGroup(groupChats, {last = true, chats = []} = {}) {
    const rendered = renderChatHistory({
        chats,
        hasMore: false,
        groups: [WORK_GROUP, PERSONAL_GROUP],
        chatsByGroupId: {'group-1': groupChatsOf(groupChats, {last})},
    });

    fireEvent.click(rendered.container.querySelector('.chat-group-header'));

    return rendered;
}

describe('ChatHistory conversation groups', () => {
    it('renders every group above the ungrouped list, collapsed', () => {
        const {container} = renderChatHistory({
            chats: chatsOf(2),
            hasMore: false,
            groups: [WORK_GROUP, PERSONAL_GROUP],
        });

        const groupHeaders = Array.from(container.querySelectorAll('.chat-group-header'));

        expect(groupHeaders.map(header => header.textContent)).toEqual(['Work', 'Personal']);
        expect(groupHeaders[0].getAttribute('aria-expanded')).toBe('false');
        expect(container.querySelectorAll('.chat-item-in-group')).toHaveLength(0);
        /* Above the ungrouped list, not below it. */
        expect(container.querySelector('.chat-history-spacer').firstElementChild.textContent).toBe('Work');
    });

    it('keeps a conversation filed under a group out of the day-bucketed list', () => {
        const chats = chatsOf(3);
        chats[1] = {...chats[1], chatGroupId: 'group-1'};

        const {container} = renderChatHistory({chats, hasMore: false, groups: [WORK_GROUP]});

        const labels = Array.from(container.querySelectorAll('.chat-item-label'))
            .map(label => label.textContent);

        expect(labels).toEqual(['Message number 0', 'Message number 2']);
    });

    /*
     * The server orders by sortOrder ascending with nulls last, then name, then id. A client-side
     * sort laid over that — a name-only one especially — would silently undo every arrangement.
     */
    it('renders the groups in the order the response arrived', () => {
        const {container} = renderChatHistory({
            chats: [],
            hasMore: false,
            groups: [
                {id: 'group-3', name: 'Reading', sortOrder: 0},
                {id: 'group-1', name: 'Work', sortOrder: 4},
                {id: 'group-2', name: 'Personal', sortOrder: null},
            ],
        });

        const groupHeaders = Array.from(container.querySelectorAll('.chat-group-header'));

        expect(groupHeaders.map(header => header.textContent)).toEqual(['Reading', 'Work', 'Personal']);
    });

    it('fetches a group first page on expand and renders its conversations indented', () => {
        const {container, loadGroupChats} = renderExpandedGroup(chatsOf(2));

        expect(loadGroupChats).toHaveBeenCalledWith('group-1');
        expect(container.querySelectorAll('.chat-item-in-group')).toHaveLength(2);
        expect(container.querySelector('.chat-group-header').getAttribute('aria-expanded')).toBe('true');
    });

    it('shows the count once the group has been opened', () => {
        const {container} = renderExpandedGroup(chatsOf(2));

        expect(container.querySelector('.chat-group-count').textContent).toBe('2');
    });

    it('reports an expanded group with nothing in it', () => {
        const {container} = renderExpandedGroup([]);

        expect(container.querySelector('.chat-group-empty').textContent).toBe('No conversations yet.');
    });

    /* One scroll box, two paging mechanisms: the group pages from its own row, never the sentinel. */
    it('pages a group from its own load-more row', () => {
        const {container, loadMoreGroupChats, loadMore} = renderExpandedGroup(chatsOf(2), {last: false});

        fireEvent.click(container.querySelector('.chat-group-load-more'));

        expect(loadMoreGroupChats).toHaveBeenCalledWith('group-1');
        expect(loadMore).not.toHaveBeenCalled();
    });

    it('collapses again without discarding the group or refetching it', () => {
        const {container, loadGroupChats} = renderExpandedGroup(chatsOf(2));

        fireEvent.click(container.querySelector('.chat-group-header'));
        expect(container.querySelectorAll('.chat-item-in-group')).toHaveLength(0);

        fireEvent.click(container.querySelector('.chat-group-header'));
        expect(container.querySelectorAll('.chat-item-in-group')).toHaveLength(2);
        /* The hook is what dedupes; the drawer simply asks again. */
        expect(loadGroupChats).toHaveBeenCalledTimes(3);
    });

    /*
     * Arranging is a gesture — the grip beside the menu is what moves a group — so the menu offers
     * the two things a gesture cannot do and nothing else.
     */
    it('offers a group rename and a group delete, and nothing else', () => {
        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false, groups: [WORK_GROUP]});

        const menu = openGroupMenu(container);

        expect(menuItemLabels(menu)).toEqual(['Rename group', 'Delete group']);
    });
});

describe('ChatHistory drag handles', () => {
    it('gives every conversation and every group a handle', () => {
        const {container} = renderExpandedGroup([chatFiledUnder('group-1')]);

        /* Beside the header button, not inside it — a button cannot nest within a button. */
        expect(container.querySelectorAll('.chat-group-header-row > .chat-history-drag-handle')).toHaveLength(2);
        expect(container.querySelectorAll('.chat-item .chat-history-drag-handle')).toHaveLength(1);
    });

    /* The gesture starts on the grip and nowhere else, so a press on the label cannot begin one. */
    it('lifts only the row whose handle was pressed', () => {
        const {container} = renderChatHistory({chats: chatsOf(2), hasMore: false});

        expect(container.querySelectorAll('.chat-history-row-dragging')).toHaveLength(0);

        startDraggingRow(container, 2);

        const lifted = container.querySelectorAll('.chat-history-row-dragging');

        expect(lifted).toHaveLength(1);
        expect(lifted[0].textContent).toContain('Message number 1');
    });

    /* Below the threshold it is still a press — that is how the grip is focused for the arrow keys. */
    it('does not lift anything until the pointer has actually travelled', () => {
        const {container} = renderChatHistory({chats: chatsOf(2), hasMore: false});

        const handle = container.querySelectorAll('.chat-history-row')[2]
            .querySelector('.chat-history-drag-handle');

        fireEvent(handle, pointerEventOf('pointerdown', {clientY: 0}));
        fireEvent(window, pointerEventOf('pointermove', {clientY: 3}));

        expect(container.querySelectorAll('.chat-history-row-dragging')).toHaveLength(0);
    });

    it('drops the gesture when the pointer is cancelled', () => {
        const {container} = renderChatHistory({chats: chatsOf(2), hasMore: false});

        startDraggingRow(container, 2);
        fireEvent(window, pointerEventOf('pointercancel', {clientY: PAST_DRAG_THRESHOLD}));

        expect(container.querySelectorAll('.chat-history-row-dragging')).toHaveLength(0);
        expect(chatGroupService.reorderChatInGroup).not.toHaveBeenCalled();
    });

    it('does not open the chat when its handle is grabbed', () => {
        const {container, setChatId} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        fireEvent.click(container.querySelector('.chat-history-drag-handle'));

        expect(setChatId).not.toHaveBeenCalled();
    });

    /* A group is both a place to drop a conversation and something that moves itself. */
    it('lifts a group by its grip', () => {
        const {container} = renderExpandedGroup([chatFiledUnder('group-1')]);

        startDraggingRow(container, 0);

        expect(container.querySelectorAll('.chat-history-row-dragging').length).toBeGreaterThan(0);
    });

    /* The section travels as a unit, so its conversations lift with the header they belong to. */
    it('lifts the conversations of a group with it', () => {
        const {container} = renderExpandedGroup([chatFiledUnder('group-1')]);

        startDraggingRow(container, 0);

        const lifted = Array.from(container.querySelectorAll('.chat-history-row-dragging'));

        expect(lifted.some(row => row.querySelector('.chat-group-header'))).toBe(true);
        expect(lifted.some(row => row.querySelector('.chat-item-in-group'))).toBe(true);
    });
});

const ARRANGED_GROUPS = [
    {id: 'group-1', name: 'Work', sortOrder: 0},
    {id: 'group-2', name: 'Personal', sortOrder: 1},
    {id: 'group-3', name: 'Reading', sortOrder: 2},
];

/*
 * Three collapsed groups above one dated conversation, so the rows are:
 * 0,1,2 group headers, 3 the day header, 4 the conversation.
 */
function renderArrangedGroups() {
    return renderChatHistory({chats: chatsOf(1), hasMore: false, groups: ARRANGED_GROUPS});
}

/* The group each update call was handed, flattened to what the assertions actually care about. */
function updatedGroupRanks() {
    return chatGroupService.updateChatGroup.mock.calls.map(
        ([chatGroup]) => [chatGroup.id, chatGroup.name, chatGroup.sortOrder]
    );
}

describe('ChatHistory ordering the groups', () => {
    /*
     * A rank is stated by the client and the server renumbers nothing behind it, so a move is the
     * whole visible list renumbered from zero — one request per group the renumbering shifted.
     */
    it('renumbers the list and writes every group the move shifted', async () => {
        const {container} = renderArrangedGroups();

        dragRow(container, 2, 0, {edge: 'before'});

        await waitFor(() => expect(chatGroupService.updateChatGroup).toHaveBeenCalledTimes(3));
        expect(updatedGroupRanks()).toEqual([
            ['group-3', 'Reading', 0],
            ['group-1', 'Work', 1],
            ['group-2', 'Personal', 2],
        ]);
    });

    /* Counted with the dragged group taken out, which is how the drop arithmetic reads an index. */
    it('counts the index with the dragged group taken out when it moves down', async () => {
        const {container} = renderArrangedGroups();

        dragRow(container, 0, 2, {edge: 'after'});

        await waitFor(() => expect(chatGroupService.updateChatGroup).toHaveBeenCalledTimes(3));
        expect(updatedGroupRanks()).toEqual([
            ['group-2', 'Personal', 0],
            ['group-3', 'Reading', 1],
            ['group-1', 'Work', 2],
        ]);
    });

    /* A move usually shifts a run of neighbours; the groups past it keep the rank they had. */
    it('leaves a group the renumbering did not shift alone', async () => {
        const {container} = renderArrangedGroups();

        pressDragHandle(container, 1, 'ArrowUp');

        await waitFor(() => expect(chatGroupService.updateChatGroup).toHaveBeenCalledTimes(2));
        expect(updatedGroupRanks()).toEqual([
            ['group-2', 'Personal', 0],
            ['group-1', 'Work', 1],
        ]);
    });

    /* Nothing is arranged until something is: the first drop states the whole list. */
    it('ranks every group on the first arrangement of a list nobody has ordered', async () => {
        const unplacedGroups = ARRANGED_GROUPS.map(chatGroup => ({...chatGroup, sortOrder: null}));

        const {container} = renderChatHistory({
            chats: chatsOf(1),
            hasMore: false,
            groups: unplacedGroups,
        });

        dragRow(container, 2, 0, {edge: 'before'});

        await waitFor(() => expect(chatGroupService.updateChatGroup).toHaveBeenCalledTimes(3));
        expect(updatedGroupRanks()).toEqual([
            ['group-3', 'Reading', 0],
            ['group-1', 'Work', 1],
            ['group-2', 'Personal', 2],
        ]);
    });

    it('issues no request for a drop that would leave the order as it is', () => {
        const {container} = renderArrangedGroups();

        dragRow(container, 0, 1, {edge: 'before'});

        expect(chatGroupService.updateChatGroup).not.toHaveBeenCalled();
    });

    /* A group has nowhere to land but among other groups. */
    it('ignores a drop on a conversation or a day header', () => {
        const {container} = renderArrangedGroups();

        dragRow(container, 0, 4, {edge: 'before'});
        dragRow(container, 0, 3, {edge: 'before'});

        expect(chatGroupService.updateChatGroup).not.toHaveBeenCalled();
        expect(chatGroupService.reorderChatInGroup).not.toHaveBeenCalled();
        expect(chatGroupService.removeChatFromGroup).not.toHaveBeenCalled();
    });

    /* The `+ New group` button builds a group around a conversation; a group is not one. */
    it('offers nothing when a group is released on the new group button', () => {
        const {container} = renderArrangedGroups();

        dragRowOntoNewGroup(container, 0);

        expect(chatGroupService.createGroup).not.toHaveBeenCalled();
        expect(chatGroupService.updateChatGroup).not.toHaveBeenCalled();
    });

    /* Two separate columns behind two separate calls; arranging groups must not disturb chats. */
    it('moves no conversation while it arranges the groups', async () => {
        const {container} = renderArrangedGroups();

        dragRow(container, 2, 0, {edge: 'before'});

        await waitFor(() => expect(chatGroupService.updateChatGroup).toHaveBeenCalled());
        expect(chatGroupService.reorderChatInGroup).not.toHaveBeenCalled();
    });

    it('redraws before the response and restores the order when a write fails', async () => {
        chatGroupService.updateChatGroup.mockRejectedValue(new Error('nope'));

        const {container, setGroupsDirectly} = renderArrangedGroups();

        dragRow(container, 2, 0, {edge: 'before'});

        /* Optimistic first, then the restore — the rendered order must not wait on the round trip. */
        expect(setGroupsDirectly).toHaveBeenCalledTimes(1);

        await waitFor(() => expect(setGroupsDirectly).toHaveBeenCalledTimes(2));
        expect(setGroupsDirectly).toHaveBeenLastCalledWith(ARRANGED_GROUPS);
        expect(toast.error).toHaveBeenCalled();
    });

    /* A 404 means the client's picture of the sidebar is stale, not that the move can be retried. */
    it('refetches the group list when a move answers 404', async () => {
        chatGroupService.updateChatGroup.mockRejectedValue(Object.assign(new Error('404'), {status: 404}));

        const {container, reloadGroups} = renderArrangedGroups();

        dragRow(container, 2, 0, {edge: 'before'});

        await waitFor(() => expect(reloadGroups).toHaveBeenCalled());
    });
});

/* Opens a group's kebab and picks Rename, which puts an editor where the header button was. */
function startGroupRename(container, groupIndex = 0) {
    openGroupMenu(container, groupIndex);
    clickMenuItem('Rename group');

    return container.querySelector('.chat-group-rename');
}

describe('ChatHistory renaming a group', () => {
    it('opens an editor in the header, seeded with the group name', () => {
        const {container} = renderArrangedGroups();

        const editor = startGroupRename(container);

        expect(editor).not.toBeNull();
        expect(editor.value).toBe('Work');
        /* The editor stands in for the header button rather than sitting beside it. */
        expect(container.querySelectorAll('.chat-group-header')).toHaveLength(2);
    });

    /*
     * The rank travels with the name because the endpoint is a full update: a body carrying only a
     * name reads as `sortOrder: null` and drops the group out of the arrangement it was in.
     */
    it('sends the new name with the rank the group already had', async () => {
        const {container} = renderArrangedGroups();

        const editor = startGroupRename(container);

        fireEvent.change(editor, {target: {value: 'Client work'}});
        fireEvent.keyDown(editor, {key: 'Enter'});

        await waitFor(() => expect(chatGroupService.updateChatGroup).toHaveBeenCalledWith({
            id: 'group-1',
            name: 'Client work',
            sortOrder: 0,
        }));
    });

    it('redraws the header before the response answers', () => {
        const {container, replaceGroups} = renderArrangedGroups();

        const editor = startGroupRename(container);

        fireEvent.change(editor, {target: {value: 'Client work'}});
        fireEvent.keyDown(editor, {key: 'Enter'});

        expect(replaceGroups).toHaveBeenCalledWith([{id: 'group-1', name: 'Client work', sortOrder: 0}]);
    });

    it('issues no request when the name was not changed', () => {
        const {container} = renderArrangedGroups();

        fireEvent.keyDown(startGroupRename(container), {key: 'Enter'});

        expect(chatGroupService.updateChatGroup).not.toHaveBeenCalled();
    });

    it('abandons the edit on Escape', () => {
        const {container} = renderArrangedGroups();

        const editor = startGroupRename(container);

        fireEvent.change(editor, {target: {value: 'Client work'}});
        fireEvent.keyDown(editor, {key: 'Escape'});

        expect(container.querySelector('.chat-group-rename')).toBeNull();
        expect(chatGroupService.updateChatGroup).not.toHaveBeenCalled();
    });

    it('puts the old name back and reports a rename that failed', async () => {
        chatGroupService.updateChatGroup.mockRejectedValue(new Error('nope'));

        const {container, replaceGroups} = renderArrangedGroups();

        const editor = startGroupRename(container);

        fireEvent.change(editor, {target: {value: 'Client work'}});
        fireEvent.keyDown(editor, {key: 'Enter'});

        await waitFor(() => expect(replaceGroups).toHaveBeenLastCalledWith([ARRANGED_GROUPS[0]]));
        expect(toast.error).toHaveBeenCalled();
    });

    /* A refused name is worth another attempt, so it is seeded back rather than thrown away. */
    it('reopens the editor on the name the server refused', async () => {
        chatGroupService.updateChatGroup.mockRejectedValue(Object.assign(new Error('400'), {status: 400}));

        const {container} = renderArrangedGroups();

        const editor = startGroupRename(container);

        fireEvent.change(editor, {target: {value: 'Client work'}});
        fireEvent.keyDown(editor, {key: 'Enter'});

        await waitFor(() => expect(container.querySelector('.chat-group-rename')).not.toBeNull());
        expect(container.querySelector('.chat-group-rename').value).toBe('Client work');
    });

    it('refetches the group list when the rename answers 404', async () => {
        chatGroupService.updateChatGroup.mockRejectedValue(Object.assign(new Error('404'), {status: 404}));

        const {container, reloadGroups} = renderArrangedGroups();

        const editor = startGroupRename(container);

        fireEvent.change(editor, {target: {value: 'Client work'}});
        fireEvent.keyDown(editor, {key: 'Enter'});

        await waitFor(() => expect(reloadGroups).toHaveBeenCalled());
        expect(container.querySelector('.chat-group-rename')).toBeNull();
    });
});

describe('ChatHistory dragging into a group', () => {
    it('files a conversation dropped on a group header and takes its row out of the ungrouped list', async () => {
        const {container, upsertChat} = renderChatHistory({
            chats: chatsOf(1),
            hasMore: false,
            groups: [WORK_GROUP],
        });

        /* 0 is the group header, 1 the day header, 2 the only conversation. */
        dragRow(container, 2, 0);

        expect(upsertChat).toHaveBeenCalledWith(expect.objectContaining({
            id: 'chat-0',
            chatGroupId: 'group-1',
            groupSortOrder: null,
        }));

        await waitFor(() => expect(chatGroupService.addChatToGroup).toHaveBeenCalledWith('group-1', 'chat-0'));
    });

    it('takes the conversation out of the group it was already in', async () => {
        const {container, removeGroupChat, addGroupChat} = renderExpandedGroup([chatFiledUnder('group-1')]);

        /* 0 is Work's header, 1 the conversation in it, 2 Personal's header. */
        dragRow(container, 1, 2);

        expect(removeGroupChat).toHaveBeenCalledWith('group-1', 'chat-0');
        expect(addGroupChat).toHaveBeenCalledWith('group-2', expect.objectContaining({chatGroupId: 'group-2'}));

        await waitFor(() => expect(chatGroupService.addChatToGroup).toHaveBeenCalledWith('group-2', 'chat-0'));
    });

    it('issues no request when the conversation is dropped back on its own group', () => {
        const {container, upsertChat} = renderExpandedGroup([chatFiledUnder('group-1')]);

        dragRow(container, 1, 0);

        expect(chatGroupService.addChatToGroup).not.toHaveBeenCalled();
        expect(chatGroupService.reorderChatInGroup).not.toHaveBeenCalled();
        expect(upsertChat).not.toHaveBeenCalled();
    });

    /* Two round trips, in this order: the conversation has to be in the group to have a place in it. */
    it('files and then places a conversation dropped onto a row inside a group', async () => {
        const {container} = renderExpandedGroup(
            [chatFiledUnder('group-1', 0, 0), chatFiledUnder('group-1', 1, 1)],
            {chats: chatsOf(4).slice(3)},
        );

        /* 0 Work, 1 chat-0, 2 chat-1, 3 Personal, 4 the day header, 5 chat-3. */
        dragRow(container, 5, 1);

        await waitFor(() => expect(chatGroupService.addChatToGroup).toHaveBeenCalledWith('group-1', 'chat-3'));
        await waitFor(() => expect(chatGroupService.reorderChatInGroup)
            .toHaveBeenCalledWith('group-1', 'chat-3', 0));
    });

    it('does not try to place a conversation whose move into the group failed', async () => {
        chatGroupService.addChatToGroup.mockRejectedValue(Object.assign(new Error('500'), {status: 500}));

        const {container} = renderExpandedGroup(
            [chatFiledUnder('group-1', 0, 0)],
            {chats: chatsOf(4).slice(3)},
        );

        /* 0 Work, 1 chat-0, 2 Personal, 3 the day header, 4 chat-3. */
        dragRow(container, 4, 1);

        await waitFor(() => expect(toast.error)
            .toHaveBeenCalledWith('Could not move the conversation to that group.'));
        expect(chatGroupService.reorderChatInGroup).not.toHaveBeenCalled();
    });

    it('restores the row and reports a failed move', async () => {
        chatGroupService.addChatToGroup.mockRejectedValue(Object.assign(new Error('500'), {status: 500}));

        const {container, upsertChat, removeGroupChat} = renderChatHistory({
            chats: chatsOf(1),
            hasMore: false,
            groups: [WORK_GROUP],
        });

        dragRow(container, 2, 0);

        await waitFor(() => expect(toast.error)
            .toHaveBeenCalledWith('Could not move the conversation to that group.'));
        expect(removeGroupChat).toHaveBeenCalledWith('group-1', 'chat-0');
        expect(upsertChat).toHaveBeenLastCalledWith(expect.objectContaining({id: 'chat-0', chatGroupId: null}));
    });

    it('reloads the group list when the destination is gone from under the user', async () => {
        chatGroupService.addChatToGroup.mockRejectedValue(Object.assign(new Error('404'), {status: 404}));

        const {container, reloadGroups} = renderChatHistory({
            chats: chatsOf(1),
            hasMore: false,
            groups: [WORK_GROUP],
        });

        dragRow(container, 2, 0);

        await waitFor(() => expect(reloadGroups).toHaveBeenCalled());
    });
});

describe('ChatHistory new group button', () => {
    it('is reachable without scrolling the list', () => {
        const {container} = renderChatHistory({chats: chatsOf(500), hasMore: false});

        const newGroupButton = container.querySelector('.chat-history-new-group');

        expect(newGroupButton).not.toBeNull();
        expect(container.querySelector('.chat-history-scroll').contains(newGroupButton)).toBe(false);
    });

    it('opens the create dialog and expands the group it creates', async () => {
        const {container, loadGroupChats} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        fireEvent.click(container.querySelector('.chat-history-new-group'));
        fireEvent.change(document.body.querySelector('.create-chat-group-input'), {target: {value: 'Work'}});
        fireEvent.submit(document.body.querySelector('.create-chat-group-dialog'));

        await waitFor(() => expect(loadGroupChats).toHaveBeenCalledWith('group-new'));
        expect(chatGroupService.addChatToGroup).not.toHaveBeenCalled();
        expect(document.body.querySelector('.create-chat-group-dialog')).toBeNull();
    });

    /* The only way left to create a group around a conversation, now that the menu offers none. */
    it('creates a group around a conversation dropped onto it', async () => {
        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        dragRowOntoNewGroup(container, 1);

        const dialogInput = document.body.querySelector('.create-chat-group-input');

        expect(dialogInput).not.toBeNull();

        fireEvent.change(dialogInput, {target: {value: '  Work  '}});
        fireEvent.submit(document.body.querySelector('.create-chat-group-dialog'));

        await waitFor(() => expect(chatGroupService.createGroup).toHaveBeenCalledWith('Work'));
        await waitFor(() => expect(chatGroupService.addChatToGroup)
            .toHaveBeenCalledWith('group-new', 'chat-0'));
    });
});

describe('ChatHistory dragging out of a group', () => {
    it('unfiles a conversation dropped on a day header and returns it to the ungrouped list', async () => {
        const {container, upsertChat, removeGroupChat} = renderExpandedGroup(
            [chatFiledUnder('group-1')],
            {chats: chatsOf(3).slice(2)},
        );

        /* 0 Work, 1 chat-0, 2 Personal, 3 the day header, 4 chat-2. */
        dragRow(container, 1, 3);

        expect(removeGroupChat).toHaveBeenCalledWith('group-1', 'chat-0');
        expect(upsertChat).toHaveBeenCalledWith(expect.objectContaining({
            id: 'chat-0',
            chatGroupId: null,
            groupSortOrder: null,
        }));

        await waitFor(() => expect(chatGroupService.removeChatFromGroup)
            .toHaveBeenCalledWith('group-1', 'chat-0'));
    });

    it('renames a conversation rendered inside a group, on both copies of it', async () => {
        chatService.renameChat.mockResolvedValue({id: 'chat-0', name: 'Q3 planning'});

        const {container, replaceGroupChat} = renderExpandedGroup([chatFiledUnder('group-1')]);

        openRowMenu(container, 0);
        clickMenuItem('Rename');

        const renameInput = container.querySelector('.chat-item-rename');
        fireEvent.change(renameInput, {target: {value: 'Q3 planning'}});
        fireEvent.keyDown(renameInput, {key: 'Enter'});

        expect(replaceGroupChat).toHaveBeenCalledWith('group-1', expect.objectContaining({
            id: 'chat-0',
            name: 'Q3 planning',
        }));

        await waitFor(() => expect(chatService.renameChat).toHaveBeenCalledWith('chat-0', 'Q3 planning'));
    });

    it('resyncs when the server says the conversation was not in that group', async () => {
        chatGroupService.removeChatFromGroup.mockRejectedValue(Object.assign(new Error('404'), {status: 404}));

        const {container, reloadGroups, reloadGroupChats} = renderExpandedGroup(
            [chatFiledUnder('group-1')],
            {chats: chatsOf(3).slice(2)},
        );

        dragRow(container, 1, 3);

        await waitFor(() => expect(toast.error)
            .toHaveBeenCalledWith('That conversation was not in this group.'));
        expect(reloadGroups).toHaveBeenCalled();
        expect(reloadGroupChats).toHaveBeenCalledWith('group-1');
    });
});

describe('ChatHistory dragging inside a group', () => {
    /* Two placed conversations followed by one still in date order. */
    function mixedGroupChats() {
        return [
            chatFiledUnder('group-1', 0, 0),
            chatFiledUnder('group-1', 1, 1),
            chatFiledUnder('group-1', null, 2),
        ];
    }

    it('sends the index within the placed prefix, to the group endpoint only', async () => {
        const {container, replaceChat, setGroupChatsDirectly} = renderExpandedGroup(mixedGroupChats());

        /* 0 Work, 1 chat-0, 2 chat-1, 3 chat-2, 4 Personal. */
        dragRow(container, 2, 1);

        /* Optimistic redraw first, so the row moves before the round trip resolves. */
        expect(setGroupChatsDirectly).toHaveBeenCalledWith('group-1', expect.any(Array));

        await waitFor(() => expect(chatGroupService.reorderChatInGroup)
            .toHaveBeenCalledWith('group-1', 'chat-1', 0));
        /* The whole-list ordering is a different column and must not move with it. */
        expect(replaceChat).not.toHaveBeenCalled();
    });

    it('counts the index with the dragged conversation taken out when it moves down', async () => {
        const {container} = renderExpandedGroup(mixedGroupChats());

        dragRow(container, 1, 2, {edge: 'after'});

        await waitFor(() => expect(chatGroupService.reorderChatInGroup)
            .toHaveBeenCalledWith('group-1', 'chat-0', 1));
    });

    it('places a conversation that was still in date order', async () => {
        const {container} = renderExpandedGroup(mixedGroupChats());

        dragRow(container, 3, 1);

        await waitFor(() => expect(chatGroupService.reorderChatInGroup)
            .toHaveBeenCalledWith('group-1', 'chat-2', 0));
    });

    /* The group's own header stands for the group's date order, the way a day header does below. */
    it('sends a null position for a drop on the group header', async () => {
        const {container} = renderExpandedGroup(mixedGroupChats());

        dragRow(container, 1, 0);

        await waitFor(() => expect(chatGroupService.reorderChatInGroup)
            .toHaveBeenCalledWith('group-1', 'chat-0', null));
    });

    it('issues no request for a drop that would leave the order as it is', () => {
        const {container} = renderExpandedGroup(mixedGroupChats());

        dragRow(container, 1, 2, {edge: 'before'});

        expect(chatGroupService.reorderChatInGroup).not.toHaveBeenCalled();
    });

    it('restores the group order when the move fails', async () => {
        chatGroupService.reorderChatInGroup.mockRejectedValue(new Error('boom'));

        const groupChats = mixedGroupChats();
        const {container, setGroupChatsDirectly} = renderExpandedGroup(groupChats);

        dragRow(container, 2, 1);

        await waitFor(() => expect(toast.error)
            .toHaveBeenCalledWith('Could not move the conversation. Please try again.'));
        expect(setGroupChatsDirectly).toHaveBeenLastCalledWith('group-1', groupChats);
    });

    it('ignores a second move while one is in flight', () => {
        chatGroupService.reorderChatInGroup.mockImplementation(() => new Promise(() => {
        }));

        const {container} = renderExpandedGroup(mixedGroupChats());

        dragRow(container, 2, 1);
        dragRow(container, 3, 1);

        expect(chatGroupService.reorderChatInGroup).toHaveBeenCalledTimes(1);
    });

    it('moves a conversation with the arrow keys from its focused handle', async () => {
        const {container} = renderExpandedGroup(mixedGroupChats());

        pressDragHandle(container, 2, 'ArrowUp');

        await waitFor(() => expect(chatGroupService.reorderChatInGroup)
            .toHaveBeenCalledWith('group-1', 'chat-1', 0));
    });
});

/*
 * A group nobody has arranged yet: the drop resolved against an empty placed list, drew its
 * indicator, and then did nothing at all.
 */
describe('ChatHistory dragging inside a group with nothing placed', () => {
    function unarrangedGroup() {
        return [chatFiledUnder('group-1', null, 0), chatFiledUnder('group-1', null, 1)];
    }

    it('arranges a conversation dropped onto another one', async () => {
        const {container} = renderExpandedGroup(unarrangedGroup());

        /* 0 is Work's header, 1 and 2 its conversations, 3 Personal's header. */
        dragRow(container, 2, 1);

        await waitFor(() => expect(chatGroupService.reorderChatInGroup)
            .toHaveBeenCalledWith('group-1', 'chat-1', 0));
    });

    /* An indicator is a promise that releasing moves something; it must not appear otherwise. */
    it('draws no indicator for a drop that would change nothing', () => {
        const {container} = renderExpandedGroup(unarrangedGroup());

        /* Row 0 is the group's own header, and these conversations are already in date order. */
        expect(hoverRowOver(container, 1, 0)).toBeNull();
    });

    it('still draws one where the drop does move something', () => {
        const {container} = renderExpandedGroup(unarrangedGroup());

        expect(hoverRowOver(container, 2, 1)).not.toBeNull();
    });
});

/*
 * The ungrouped list is a timeline: ordered by date and by nothing else. Dragging within it used to
 * pull a conversation out of its day bucket and up to the top of the drawer, which is the surprise
 * this suite exists to hold shut.
 */
describe('ChatHistory dragging in the ungrouped list', () => {
    function sectionHeaders(container) {
        return Array.from(container.querySelectorAll('.date-header')).map(header => header.textContent);
    }

    /* A conversation carrying a sortOrder from an older build must still render in its day bucket. */
    function chatsWithStaleSortOrder() {
        const chats = chatsOf(3);

        return [{...chats[0], sortOrder: 0}, {...chats[1], sortOrder: 3}, chats[2]];
    }

    it('labels nothing but the day buckets, whatever sortOrder the response carries', () => {
        const {container} = renderChatHistory({chats: chatsWithStaleSortOrder(), hasMore: false});

        expect(sectionHeaders(container)).toEqual(['Today']);
        expect(Array.from(container.querySelectorAll('.chat-item-label')).map(label => label.textContent))
            .toEqual(['Message number 0', 'Message number 1', 'Message number 2']);
    });

    it('draws no indicator anywhere in the list', () => {
        const {container} = renderChatHistory({chats: chatsOf(3), hasMore: false});

        /* 0 is the day header, 1..3 the conversations. */
        expect(hoverRowOver(container, 3, 1)).toBeNull();
        expect(hoverRowOver(container, 1, 2, {edge: 'after'})).toBeNull();
        expect(hoverRowOver(container, 2, 0)).toBeNull();
    });

    it('issues no request for a drop anywhere in the list', () => {
        const {container} = renderChatHistory({chats: chatsOf(3), hasMore: false});

        dragRow(container, 3, 1);
        dragRow(container, 1, 2, {edge: 'after'});
        dragRow(container, 2, 0);

        expect(chatGroupService.reorderChatInGroup).not.toHaveBeenCalled();
        expect(chatGroupService.addChatToGroup).not.toHaveBeenCalled();
    });

    /* Arrow keys reorder inside a group; out here there is nothing to move a conversation past. */
    it('ignores the arrow keys on an ungrouped conversation', () => {
        const {container} = renderChatHistory({chats: chatsOf(3), hasMore: false});

        pressDragHandle(container, 2, 'ArrowUp');
        pressDragHandle(container, 2, 'ArrowDown');

        expect(chatGroupService.reorderChatInGroup).not.toHaveBeenCalled();
    });

    it('says as much on the grip', () => {
        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        const handle = container.querySelector('.chat-item .chat-history-drag-handle');

        expect(handle.getAttribute('aria-label')).toBe('Move Message number 0');
        expect(handle.getAttribute('title')).not.toMatch(/reorder/i);
    });

    /* Filing into a group is the point of keeping a grip on these rows at all. */
    it('still files into a group', async () => {
        const {container} = renderChatHistory({
            chats: chatsOf(1),
            hasMore: false,
            groups: [WORK_GROUP],
        });

        /* 0 is the group header, 1 the day header, 2 the conversation. */
        dragRow(container, 2, 0);

        await waitFor(() => expect(chatGroupService.addChatToGroup).toHaveBeenCalledWith('group-1', 'chat-0'));
    });
});

/* Row indices shift with however many group sections sit above the day buckets. */
function rowIndexOfConversation(container, label) {
    return Array.from(container.querySelectorAll('.chat-history-row'))
        .findIndex(row => row.querySelector('.chat-item-label')?.textContent === label);
}

/* Comfortably past the drawer's edge and the dead band that guards it. */
const WELL_CLEAR_OF_DRAWER = 600;

/* A drift that clips the drawer's edge on the way past — inside the band, so not an exit. */
const DRIFTED_PAST_DRAWER = DRAWER_WIDTH + 8;

/* Releases the conversation clear of the drawer. */
function dragRowOutOfDrawer(container, fromIndex) {
    const handle = container.querySelectorAll('.chat-history-row')[fromIndex]
        .querySelector('.chat-history-drag-handle');

    hitTestElement = document.body;

    fireEvent(handle, pointerEventOf('pointerdown', {clientY: 0}));
    fireEvent(window, pointerEventOf('pointermove', {clientX: WELL_CLEAR_OF_DRAWER, clientY: PAST_DRAG_THRESHOLD}));
    fireEvent(window, pointerEventOf('pointerup', {clientX: WELL_CLEAR_OF_DRAWER, clientY: PAST_DRAG_THRESHOLD}));

    return document.body.querySelector('.chat-drop-action-menu');
}

function dropActionSelect() {
    return document.body.querySelector('.chat-drop-action-select');
}

function dropActionOptions() {
    return Array.from(dropActionSelect()?.options ?? []).map(option => option.textContent);
}

/* The group picker acts on change; there is no separate confirm. */
function chooseDropDestination(value) {
    fireEvent.change(dropActionSelect(), {target: {value}});
}

function clickDeleteDropAction() {
    fireEvent.click(document.body.querySelector('.chat-drop-action-menu .chat-row-menu-item'));
}

describe('ChatHistory dragging out of the drawer', () => {
    it('offers a destination and a delete, and does neither on its own', () => {
        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        const menu = dragRowOutOfDrawer(container, 1);

        expect(menu).not.toBeNull();
        expect(dropActionSelect()).not.toBeNull();
        expect(menu.querySelector('.chat-row-menu-item').textContent).toBe('Delete conversation');
        expect(chatService.deleteChat).not.toHaveBeenCalled();
        expect(chatGroupService.createGroup).not.toHaveBeenCalled();
        expect(chatGroupService.addChatToGroup).not.toHaveBeenCalled();
    });

    /* New Group leads, then the groups themselves in an order a reader can scan. */
    it('lists New Group first and the existing groups alphabetically after it', () => {
        const {container} = renderChatHistory({
            chats: chatsOf(1),
            hasMore: false,
            groups: [
                {id: 'group-3', name: 'zebra'},
                {id: 'group-1', name: 'Alpha'},
                {id: 'group-2', name: 'middle'},
            ],
        });

        dragRowOutOfDrawer(container, rowIndexOfConversation(container, 'Message number 0'));

        expect(dropActionOptions())
            .toEqual(['Choose a group…', 'New Group', 'Alpha', 'middle', 'zebra']);
    });

    it('files the conversation into the group that is chosen', async () => {
        const {container, upsertChat} = renderChatHistory({
            chats: chatsOf(1),
            hasMore: false,
            groups: [WORK_GROUP, PERSONAL_GROUP],
        });

        dragRowOutOfDrawer(container, rowIndexOfConversation(container, 'Message number 0'));
        chooseDropDestination('group-2');

        expect(upsertChat).toHaveBeenCalledWith(expect.objectContaining({
            id: 'chat-0',
            chatGroupId: 'group-2',
        }));

        await waitFor(() => expect(chatGroupService.addChatToGroup)
            .toHaveBeenCalledWith('group-2', 'chat-0'));
        expect(document.body.querySelector('.chat-drop-action-menu')).toBeNull();
    });

    /* Offered so the list reads whole, but inert — choosing it would be a request for no change. */
    it('cannot choose the group the conversation is already in', () => {
        const {container} = renderExpandedGroup([chatFiledUnder('group-1')]);

        dragRowOutOfDrawer(container, rowIndexOfConversation(container, 'Message number 0'));

        const options = Array.from(dropActionSelect().options);

        expect(options.find(option => option.value === 'group-1').disabled).toBe(true);
        expect(options.find(option => option.value === 'group-2').disabled).toBe(false);
    });

    it('dims the drawer while the conversation is held outside it', () => {
        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        const handle = container.querySelectorAll('.chat-history-row')[1]
            .querySelector('.chat-history-drag-handle');

        hitTestElement = document.body;

        fireEvent(handle, pointerEventOf('pointerdown', {clientY: 0}));
        fireEvent(window, pointerEventOf('pointermove', {clientX: WELL_CLEAR_OF_DRAWER, clientY: PAST_DRAG_THRESHOLD}));

        expect(container.querySelector('.chat-drawer-releasing')).not.toBeNull();
    });

    it('builds a group around the conversation', async () => {
        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        dragRowOutOfDrawer(container, 1);
        chooseDropDestination('new-group');

        fireEvent.change(document.body.querySelector('.create-chat-group-input'), {target: {value: 'Work'}});
        fireEvent.submit(document.body.querySelector('.create-chat-group-dialog'));

        await waitFor(() => expect(chatGroupService.createGroup).toHaveBeenCalledWith('Work'));
        await waitFor(() => expect(chatGroupService.addChatToGroup)
            .toHaveBeenCalledWith('group-new', 'chat-0'));
    });

    /*
     * Through the confirmation, never around it — that dialog is what refuses to delete a
     * conversation that is still streaming, and what says the delete cannot be undone.
     */
    it('opens the delete confirmation rather than deleting', async () => {
        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        dragRowOutOfDrawer(container, 1);
        clickDeleteDropAction();

        expect(document.body.querySelector('.delete-chat-dialog')).not.toBeNull();
        expect(chatService.deleteChat).not.toHaveBeenCalled();

        fireEvent.click(document.body.querySelector('.delete-chat-dialog-confirm'));

        await waitFor(() => expect(chatService.deleteChat).toHaveBeenCalledWith('chat-0'));
    });

    it('cannot delete a conversation that is still streaming', () => {
        const {container} = renderChatHistory({
            chats: chatsOf(1),
            hasMore: false,
            streamingChatId: 'chat-0',
        });

        dragRowOutOfDrawer(container, 1);
        clickDeleteDropAction();

        expect(document.body.querySelector('.delete-chat-dialog-confirm').disabled).toBe(true);
        expect(chatService.deleteChat).not.toHaveBeenCalled();
    });

    it('closes without touching the conversation on Escape', () => {
        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        const menu = dragRowOutOfDrawer(container, 1);

        fireEvent.keyDown(menu, {key: 'Escape'});

        expect(document.body.querySelector('.chat-drop-action-menu')).toBeNull();
        expect(chatService.deleteChat).not.toHaveBeenCalled();
        expect(chatGroupService.createGroup).not.toHaveBeenCalled();
    });

    /*
     * A diagonal drag that clips the drawer's edge on its way down the list must not be answered
     * with a menu that has Delete in it.
     */
    it('offers nothing for a drift that only just clears the drawer', () => {
        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        const handle = container.querySelectorAll('.chat-history-row')[1]
            .querySelector('.chat-history-drag-handle');

        hitTestElement = document.body;

        fireEvent(handle, pointerEventOf('pointerdown', {clientY: 0}));
        fireEvent(window, pointerEventOf('pointermove', {clientX: DRIFTED_PAST_DRAWER, clientY: PAST_DRAG_THRESHOLD}));

        expect(container.querySelector('.chat-drawer-releasing')).toBeNull();

        fireEvent(window, pointerEventOf('pointerup', {clientX: DRIFTED_PAST_DRAWER, clientY: PAST_DRAG_THRESHOLD}));

        expect(document.body.querySelector('.chat-drop-action-menu')).toBeNull();
        expect(chatService.deleteChat).not.toHaveBeenCalled();
    });

    /* The pointer left the viewport entirely, which is abandoning the drag rather than aiming. */
    it('offers nothing when the pointer leaves the viewport', () => {
        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        const handle = container.querySelectorAll('.chat-history-row')[1]
            .querySelector('.chat-history-drag-handle');

        hitTestElement = null;

        fireEvent(handle, pointerEventOf('pointerdown', {clientY: 0}));
        fireEvent(window, pointerEventOf('pointermove', {clientY: PAST_DRAG_THRESHOLD}));
        fireEvent(window, pointerEventOf('pointerup', {clientY: PAST_DRAG_THRESHOLD}));

        expect(document.body.querySelector('.chat-drop-action-menu')).toBeNull();
    });

    it('abandons the drag on Escape before it is released', () => {
        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        const handle = container.querySelectorAll('.chat-history-row')[1]
            .querySelector('.chat-history-drag-handle');

        hitTestElement = document.body;

        fireEvent(handle, pointerEventOf('pointerdown', {clientY: 0}));
        fireEvent(window, pointerEventOf('pointermove', {clientX: WELL_CLEAR_OF_DRAWER, clientY: PAST_DRAG_THRESHOLD}));
        fireEvent.keyDown(window, {key: 'Escape'});
        fireEvent(window, pointerEventOf('pointerup', {clientX: WELL_CLEAR_OF_DRAWER, clientY: PAST_DRAG_THRESHOLD}));

        expect(document.body.querySelector('.chat-drop-action-menu')).toBeNull();
        expect(container.querySelectorAll('.chat-history-row-dragging')).toHaveLength(0);
    });
});

function openDeleteDialog(container, rowIndex = 0) {
    openRowMenu(container, rowIndex);
    clickMenuItem('Delete');

    return document.body.querySelector('.delete-chat-dialog');
}

function openDeleteGroupDialog(container, groupIndex = 0) {
    openGroupMenu(container, groupIndex);
    clickMenuItem('Delete group');

    return document.body.querySelector('.delete-chat-group-dialog');
}

function clickGroupDialog(className) {
    fireEvent.click(document.body.querySelector(`.delete-chat-group-dialog-${className}`));
}

/* One page of a group, in the shape `findGroupChats` normalizes to. */
function groupPageOf(chatIds, {last = true, page = 0} = {}) {
    return {
        chats: chatIds.map(chatId => ({id: chatId})),
        page,
        last,
        totalElements: chatIds.length,
    };
}

describe('ChatHistory delete group', () => {
    /*
     * Three answers, because the destructive reading and the harmless one are both plausible and
     * the difference between them is everything.
     */
    it('asks what should happen to the conversations inside it', () => {
        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false, groups: [WORK_GROUP]});

        const dialog = openDeleteGroupDialog(container);

        expect(dialog).not.toBeNull();
        expect(Array.from(dialog.querySelectorAll('.delete-chat-group-dialog-actions button'))
            .map(button => button.textContent))
            .toEqual(['Cancel', 'Delete group only', 'Delete group and conversations']);
        expect(chatGroupService.deleteGroup).not.toHaveBeenCalled();
    });

    it('closes on Cancel without deleting anything', () => {
        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false, groups: [WORK_GROUP]});

        openDeleteGroupDialog(container);
        clickGroupDialog('cancel');

        expect(document.body.querySelector('.delete-chat-group-dialog')).toBeNull();
        expect(chatGroupService.deleteGroup).not.toHaveBeenCalled();
        expect(chatService.deleteChat).not.toHaveBeenCalled();
    });

    /*
     * The API ungroups rather than cascades, so the conversations are still out there — reloading
     * the history is what finds them again and puts them back in their day buckets.
     */
    it('deletes the group alone and goes looking for its freed conversations', async () => {
        const {container, reloadGroups, setReloadHistoryTrigger} = renderChatHistory({
            chats: chatsOf(1),
            hasMore: false,
            groups: [WORK_GROUP],
        });

        openDeleteGroupDialog(container);
        clickGroupDialog('keep-chats');

        await waitFor(() => expect(chatGroupService.deleteGroup).toHaveBeenCalledWith('group-1'));
        expect(chatService.deleteChat).not.toHaveBeenCalled();
        await waitFor(() => expect(reloadGroups).toHaveBeenCalled());
        expect(setReloadHistoryTrigger).toHaveBeenCalled();
        expect(document.body.querySelector('.delete-chat-group-dialog')).toBeNull();
    });

    /* Every page, because the drawer only holds the ones that were scrolled to. */
    it('reads the whole group before deleting a single conversation', async () => {
        chatGroupService.findGroupChats
            .mockResolvedValueOnce(groupPageOf(['chat-a', 'chat-b'], {last: false, page: 0}))
            .mockResolvedValueOnce(groupPageOf(['chat-c'], {last: true, page: 1}));

        const {container, removeChat} = renderChatHistory({
            chats: chatsOf(1),
            hasMore: false,
            groups: [WORK_GROUP],
        });

        openDeleteGroupDialog(container);
        clickGroupDialog('confirm');

        await waitFor(() => expect(chatGroupService.deleteGroup).toHaveBeenCalledWith('group-1'));

        expect(chatGroupService.findGroupChats).toHaveBeenCalledTimes(2);
        expect(chatService.deleteChat.mock.calls.map(call => call[0]))
            .toEqual(['chat-a', 'chat-b', 'chat-c']);
        expect(removeChat).toHaveBeenCalledWith('chat-b');
    });

    /* The group goes last: until every conversation is gone it still holds what survived. */
    it('deletes the conversations before the group', async () => {
        chatGroupService.findGroupChats.mockResolvedValue(groupPageOf(['chat-a']));

        const order = [];
        chatService.deleteChat.mockImplementation(async () => order.push('chat'));
        chatGroupService.deleteGroup.mockImplementation(async () => order.push('group'));

        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false, groups: [WORK_GROUP]});

        openDeleteGroupDialog(container);
        clickGroupDialog('confirm');

        await waitFor(() => expect(order).toEqual(['chat', 'group']));
    });

    /*
     * Refused after reading and before deleting, so the refusal costs nothing — a turn in flight
     * would write a message against a conversation that no longer exists.
     */
    it('refuses the cascade while a conversation in the group is still responding', async () => {
        chatGroupService.findGroupChats.mockResolvedValue(groupPageOf(['chat-a', 'chat-streaming']));

        const {container} = renderChatHistory({
            chats: chatsOf(1),
            hasMore: false,
            groups: [WORK_GROUP],
            streamingChatId: 'chat-streaming',
        });

        openDeleteGroupDialog(container);
        clickGroupDialog('confirm');

        await waitFor(() => expect(document.body.querySelector('.delete-chat-group-dialog-error'))
            .not.toBeNull());
        expect(chatService.deleteChat).not.toHaveBeenCalled();
        expect(chatGroupService.deleteGroup).not.toHaveBeenCalled();
        expect(document.body.querySelector('.delete-chat-group-dialog')).not.toBeNull();
    });

    it('deletes nothing when the group cannot be read', async () => {
        chatGroupService.findGroupChats.mockRejectedValue(new Error('boom'));

        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false, groups: [WORK_GROUP]});

        openDeleteGroupDialog(container);
        clickGroupDialog('confirm');

        await waitFor(() => expect(document.body.querySelector('.delete-chat-group-dialog-error'))
            .not.toBeNull());
        expect(chatService.deleteChat).not.toHaveBeenCalled();
        expect(chatGroupService.deleteGroup).not.toHaveBeenCalled();
    });

    /* Stopping part-way leaves the group in place, holding whatever was not reached. */
    it('stops at a conversation it cannot delete and leaves the group alone', async () => {
        chatGroupService.findGroupChats.mockResolvedValue(groupPageOf(['chat-a', 'chat-b']));
        chatService.deleteChat
            .mockResolvedValueOnce(null)
            .mockRejectedValueOnce(Object.assign(new Error('500'), {status: 500}));

        const {container, removeChat, reloadGroupChats} = renderChatHistory({
            chats: chatsOf(1),
            hasMore: false,
            groups: [WORK_GROUP],
        });

        openDeleteGroupDialog(container);
        clickGroupDialog('confirm');

        await waitFor(() => expect(document.body.querySelector('.delete-chat-group-dialog-error'))
            .not.toBeNull());
        expect(chatGroupService.deleteGroup).not.toHaveBeenCalled();
        expect(removeChat).toHaveBeenCalledWith('chat-a');
        expect(removeChat).not.toHaveBeenCalledWith('chat-b');
        expect(reloadGroupChats).toHaveBeenCalledWith('group-1');
    });

    /* A conversation already gone is the outcome asked for, not a reason to stop. */
    it('carries on past a conversation that was already deleted', async () => {
        chatGroupService.findGroupChats.mockResolvedValue(groupPageOf(['chat-a', 'chat-b']));
        chatService.deleteChat
            .mockRejectedValueOnce(Object.assign(new Error('404'), {status: 404}))
            .mockResolvedValueOnce(null);

        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false, groups: [WORK_GROUP]});

        openDeleteGroupDialog(container);
        clickGroupDialog('confirm');

        await waitFor(() => expect(chatGroupService.deleteGroup).toHaveBeenCalledWith('group-1'));
    });

    it('clears the workspace when the open conversation goes with the group', async () => {
        chatGroupService.findGroupChats.mockResolvedValue(groupPageOf(['chat-open']));

        const {container, setChatId, setChatHistory} = renderChatHistory({
            chats: chatsOf(1),
            hasMore: false,
            groups: [WORK_GROUP],
            openChatId: 'chat-open',
        });

        openDeleteGroupDialog(container);
        clickGroupDialog('confirm');

        await waitFor(() => expect(setChatHistory).toHaveBeenCalledWith([]));
        expect(setChatId).toHaveBeenCalledWith(null);
        expect(navigateSpy).toHaveBeenCalledWith('/');
    });
});

describe('ChatHistory delete', () => {
    it('confirms first, naming the conversation and what goes with it', () => {
        const {container} = renderChatHistory({chats: chatsOf(1, 'Trip planning'), hasMore: false});

        const dialog = openDeleteDialog(container);

        expect(dialog).not.toBeNull();
        expect(dialog.textContent).toContain('Delete conversation?');
        expect(dialog.textContent).toContain('"Trip planning"');
        expect(dialog.textContent).toContain('This cannot be undone.');
        expect(chatService.deleteChat).not.toHaveBeenCalled();
    });

    it('closes on Cancel with the row still in place', () => {
        const {container, removeChat} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        openDeleteDialog(container);
        fireEvent.click(document.body.querySelector('.delete-chat-dialog-cancel'));

        expect(document.body.querySelector('.delete-chat-dialog')).toBeNull();
        expect(chatService.deleteChat).not.toHaveBeenCalled();
        expect(removeChat).not.toHaveBeenCalled();
    });

    it('drops the row, closes the dialog and reports the delete', async () => {
        const {container, removeChat} = renderChatHistory({chats: chatsOf(2), hasMore: false});

        openDeleteDialog(container, 1);
        fireEvent.click(document.body.querySelector('.delete-chat-dialog-confirm'));

        await waitFor(() => expect(removeChat).toHaveBeenCalledWith('chat-1'));
        expect(chatService.deleteChat).toHaveBeenCalledWith('chat-1');
        expect(document.body.querySelector('.delete-chat-dialog')).toBeNull();
        expect(toast).toHaveBeenCalledWith('Conversation deleted');
    });

    it('drops a row that was rendered inside a group from that group too', async () => {
        const {container, removeChat, removeGroupChat} = renderExpandedGroup([chatFiledUnder('group-1')]);

        openDeleteDialog(container, 0);
        fireEvent.click(document.body.querySelector('.delete-chat-dialog-confirm'));

        await waitFor(() => expect(removeGroupChat).toHaveBeenCalledWith('group-1', 'chat-0'));
        expect(removeChat).toHaveBeenCalledWith('chat-0');
    });

    /* A repeat is a 404: the conversation is gone, which is exactly what was asked for. */
    it('drops the row without an error when the conversation was already gone', async () => {
        chatService.deleteChat.mockRejectedValue(Object.assign(new Error('404'), {status: 404}));

        const {container, removeChat} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        openDeleteDialog(container);
        fireEvent.click(document.body.querySelector('.delete-chat-dialog-confirm'));

        await waitFor(() => expect(removeChat).toHaveBeenCalledWith('chat-0'));
        expect(document.body.querySelector('.delete-chat-dialog')).toBeNull();
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('keeps the dialog and the row on any other failure', async () => {
        chatService.deleteChat.mockRejectedValue(Object.assign(new Error('500'), {status: 500}));

        const {container, removeChat} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        openDeleteDialog(container);
        fireEvent.click(document.body.querySelector('.delete-chat-dialog-confirm'));

        await waitFor(() => expect(document.body.querySelector('.delete-chat-dialog-error')).not.toBeNull());
        expect(removeChat).not.toHaveBeenCalled();
        expect(container.querySelectorAll('.chat-item')).toHaveLength(1);
    });

    it('clears the workspace when the conversation being deleted is the open one', async () => {
        const {container, setChatId, setChatHistory} = renderChatHistory({
            chats: chatsOf(2),
            hasMore: false,
            openChatId: 'chat-1',
        });

        openDeleteDialog(container, 1);
        fireEvent.click(document.body.querySelector('.delete-chat-dialog-confirm'));

        await waitFor(() => expect(setChatHistory).toHaveBeenCalledWith([]));
        expect(setChatId).toHaveBeenCalledWith(null);
        expect(navigateSpy).toHaveBeenCalledWith('/');
    });

    it('leaves the open transcript alone when another conversation is deleted', async () => {
        const {container, setChatId, setChatHistory, removeChat} = renderChatHistory({
            chats: chatsOf(2),
            hasMore: false,
            openChatId: 'chat-0',
        });

        openDeleteDialog(container, 1);
        fireEvent.click(document.body.querySelector('.delete-chat-dialog-confirm'));

        await waitFor(() => expect(removeChat).toHaveBeenCalledWith('chat-1'));
        expect(setChatHistory).not.toHaveBeenCalled();
        expect(setChatId).not.toHaveBeenCalled();
        expect(navigateSpy).not.toHaveBeenCalled();
    });

    /* The backend runs an in-flight turn to completion, onto a conversation that would be gone. */
    it('disables Delete for the conversation that is streaming, with a reason', () => {
        const {container} = renderChatHistory({
            chats: chatsOf(2),
            hasMore: false,
            streamingChatId: 'chat-1',
        });

        openRowMenu(container, 1);

        const deleteItem = menuItems().find(
            item => item.querySelector('.chat-row-menu-item-label').textContent === 'Delete'
        );

        expect(deleteItem.disabled).toBe(true);
        expect(deleteItem.getAttribute('title')).toBe('Wait for the response to finish.');

        fireEvent.click(deleteItem);
        expect(document.body.querySelector('.delete-chat-dialog')).toBeNull();
    });

    it('leaves Delete alone for a conversation that is not the streaming one', () => {
        const {container} = renderChatHistory({
            chats: chatsOf(2),
            hasMore: false,
            streamingChatId: 'chat-1',
        });

        openRowMenu(container, 0);

        const deleteItem = menuItems().find(
            item => item.querySelector('.chat-row-menu-item-label').textContent === 'Delete'
        );

        expect(deleteItem.disabled).toBe(false);
    });

    it('returns focus to the row kebab when the dialog closes', () => {
        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        const trigger = container.querySelector('.chat-row-menu-trigger');

        openDeleteDialog(container);
        expect(document.activeElement).toBe(document.body.querySelector('.delete-chat-dialog-cancel'));

        fireEvent.click(document.body.querySelector('.delete-chat-dialog-cancel'));

        expect(document.activeElement).toBe(trigger);
    });

    /*
     * The backend deletes irreversibly, so no control anywhere may suggest otherwise. The dialog's
     * prose says "cannot be undone"; what must not exist is something offering to do it.
     */
    it('offers no undo, restore or archive control anywhere', async () => {
        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        openRowMenu(container);
        const menuLabels = menuItemLabels().join(' ');

        expect(menuLabels).not.toMatch(/undo|restore|archive|trash/i);

        clickMenuItem('Delete');
        fireEvent.click(document.body.querySelector('.delete-chat-dialog-confirm'));

        await waitFor(() => expect(toast).toHaveBeenCalledWith('Conversation deleted'));

        const controlLabels = Array.from(document.body.querySelectorAll('button'))
            .map(button => button.textContent)
            .join(' ');

        expect(controlLabels).not.toMatch(/undo|restore|archive|trash/i);
    });
});

describe('ChatHistory paging past filtered-out pages', () => {
    /*
     * Every conversation on the page is filed under a group, so the list the sentinel watches gains
     * no rows at all and would otherwise never ask for the following page.
     */
    it('keeps asking for pages while every one of them is filtered out, up to a cap', async () => {
        const groupedChats = chatsOf(3).map(chat => ({...chat, chatGroupId: 'group-1'}));

        const {loadMore, container} = renderChatHistory({chats: groupedChats, hasMore: true});

        await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(10));
        expect(container.querySelectorAll('.chat-item')).toHaveLength(0);
    });

    it('stops topping up once the last page has landed', async () => {
        const groupedChats = chatsOf(3).map(chat => ({...chat, chatGroupId: 'group-1'}));

        const {loadMore} = renderChatHistory({chats: groupedChats, hasMore: false});

        await waitFor(() => expect(loadMore).not.toHaveBeenCalled());
    });
});
