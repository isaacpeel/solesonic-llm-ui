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
        reorderChat: vi.fn(),
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

import ChatHistory from '../../src/chat/ChatHistory.jsx';
import {toast} from 'react-toastify';
import {SharedDataContext} from '../../src/context/SharedDataContext.jsx';
import usePagedChatHistory from '../../src/hooks/usePagedChatHistory.js';
import useChatGroups from '../../src/hooks/useChatGroups.js';
import chatService from '../../src/service/ChatService.js';
import chatGroupService from '../../src/service/ChatGroupService.js';

const VIEWPORT_HEIGHT = 600;

const ROW_HEIGHT = 41;

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

    hitTestElement = null;
    document.elementFromPoint = function stubbedElementFromPoint() {
        return hitTestElement;
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
    const setDrawerOpen = vi.fn();
    const replaceChat = vi.fn();
    const removeChat = vi.fn();
    const upsertChat = vi.fn();
    const setChatsDirectly = vi.fn();

    const reloadGroups = vi.fn();
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
        setDrawerOpen,
        replaceChat,
        removeChat,
        upsertChat,
        setChatsDirectly,
        reloadGroups,
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
    chatService.reorderChat.mockReset();
    chatService.reorderChat.mockResolvedValue({id: 'chat-0', sortOrder: 0});
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
    fireEvent.click(container.querySelectorAll('.chat-row-menu-trigger')[rowIndex]);

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

    it('offers no way to rename or delete a group', () => {
        const {container} = renderChatHistory({chats: chatsOf(1), hasMore: false, groups: [WORK_GROUP]});

        openRowMenu(container, 0);

        const visibleText = container.textContent + document.body.querySelector('.chat-row-menu').textContent;

        expect(visibleText).not.toMatch(/rename group/i);
        expect(visibleText).not.toMatch(/delete group/i);
    });
});

describe('ChatHistory drag handles', () => {
    it('gives every conversation and every group a handle', () => {
        const {container} = renderExpandedGroup([chatFiledUnder('group-1')]);

        expect(container.querySelectorAll('.chat-group-header .chat-history-drag-handle')).toHaveLength(2);
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
        expect(chatService.reorderChat).not.toHaveBeenCalled();
    });

    it('does not open the chat when its handle is grabbed', () => {
        const {container, setChatId} = renderChatHistory({chats: chatsOf(1), hasMore: false});

        fireEvent.click(container.querySelector('.chat-history-drag-handle'));

        expect(setChatId).not.toHaveBeenCalled();
    });

    /* The API ships no ordering for groups, so a group is a place to drop and nothing more. */
    it('refuses to drag a group', () => {
        const {container} = renderExpandedGroup([chatFiledUnder('group-1')]);

        /* The grip on a group header is a bare span; pressing it begins nothing. */
        startDraggingRow(container, 0);

        expect(container.querySelectorAll('.chat-history-row-dragging')).toHaveLength(0);
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

describe('ChatHistory dragging in the whole list', () => {
    /*
     * Two hand-placed conversations followed by one still in date order. The stored values carry a
     * gap, the way they do after a placed conversation has been deleted — nothing may read them as
     * indices.
     */
    function mixedChats() {
        const chats = chatsOf(3);

        return [
            {...chats[0], sortOrder: 0},
            {...chats[1], sortOrder: 3},
            chats[2],
        ];
    }

    function sectionHeaders(container) {
        return Array.from(container.querySelectorAll('.date-header')).map(header => header.textContent);
    }

    function rowLabels(container) {
        return Array.from(container.querySelectorAll('.chat-item-label')).map(label => label.textContent);
    }

    it('renders no Arranged section while nothing has been placed', () => {
        const {container} = renderChatHistory({chats: chatsOf(3), hasMore: false});

        expect(sectionHeaders(container)).toEqual(['Today']);
    });

    it('renders the placed conversations above the first day header, in response order', () => {
        const {container} = renderChatHistory({chats: mixedChats(), hasMore: false});

        expect(sectionHeaders(container)).toEqual(['Arranged', 'Today']);
        expect(rowLabels(container)).toEqual(['Message number 0', 'Message number 1', 'Message number 2']);
        /* The Arranged header is the first row in the list, not a section below the day buckets. */
        expect(container.querySelector('.chat-history-spacer').firstElementChild.textContent)
            .toBe('Arranged');
    });

    it('places an unplaced conversation dropped into the Arranged section', async () => {
        const {container, setChatsDirectly} = renderChatHistory({chats: mixedChats(), hasMore: false});

        /* 0 Arranged, 1 chat-0, 2 chat-1, 3 the day header, 4 chat-2. */
        dragRow(container, 4, 1);

        /* Optimistic redraw first, so the row moves before the round trip resolves. */
        expect(setChatsDirectly).toHaveBeenCalledWith(expect.any(Array));
        expect(setChatsDirectly.mock.calls[0][0].map(chat => chat.id))
            .toEqual(['chat-2', 'chat-0', 'chat-1']);

        await waitFor(() => expect(chatService.reorderChat).toHaveBeenCalledWith('chat-2', 0));
    });

    /* The index comes from the rendered Arranged array — never from the neighbour's sortOrder of 0. */
    it('sends the index within the Arranged section rather than a neighbour sortOrder', async () => {
        const {container} = renderChatHistory({chats: mixedChats(), hasMore: false});

        dragRow(container, 2, 1);

        await waitFor(() => expect(chatService.reorderChat).toHaveBeenCalledWith('chat-1', 0));
    });

    it('counts the index with the dragged conversation taken out when it moves down', async () => {
        const {container} = renderChatHistory({chats: mixedChats(), hasMore: false});

        dragRow(container, 1, 2, {edge: 'after'});

        await waitFor(() => expect(chatService.reorderChat).toHaveBeenCalledWith('chat-0', 1));
    });

    /* A day header stands for the date-ordered region, so landing on one gives the row back to it. */
    it('sends a null position for a drop on a day header', async () => {
        const {container} = renderChatHistory({chats: mixedChats(), hasMore: false});

        dragRow(container, 1, 3);

        await waitFor(() => expect(chatService.reorderChat).toHaveBeenCalledWith('chat-0', null));
    });

    it('sends position zero for a drop on the Arranged header', async () => {
        const {container} = renderChatHistory({chats: mixedChats(), hasMore: false});

        dragRow(container, 2, 0);

        await waitFor(() => expect(chatService.reorderChat).toHaveBeenCalledWith('chat-1', 0));
    });

    it('issues no request for a drop that would leave the order as it is', () => {
        const {container} = renderChatHistory({chats: mixedChats(), hasMore: false});

        dragRow(container, 1, 2, {edge: 'before'});

        expect(chatService.reorderChat).not.toHaveBeenCalled();
    });

    it('issues no request when a conversation is dropped on itself', () => {
        const {container} = renderChatHistory({chats: mixedChats(), hasMore: false});

        dragRow(container, 1, 1);

        expect(chatService.reorderChat).not.toHaveBeenCalled();
    });

    it('merges the authoritative sortOrder the response carries', async () => {
        chatService.reorderChat.mockResolvedValue({id: 'chat-2', sortOrder: 0});

        const {container, replaceChat} = renderChatHistory({chats: mixedChats(), hasMore: false});

        dragRow(container, 4, 1);

        await waitFor(() => expect(replaceChat).toHaveBeenCalledWith({id: 'chat-2', sortOrder: 0}));
    });

    it('restores the previous order when the move fails', async () => {
        chatService.reorderChat.mockRejectedValue(new Error('boom'));

        const chats = mixedChats();
        const {container, setChatsDirectly} = renderChatHistory({chats, hasMore: false});

        dragRow(container, 2, 1);

        await waitFor(() => expect(toast.error)
            .toHaveBeenCalledWith('Could not move the conversation. Please try again.'));
        expect(setChatsDirectly).toHaveBeenLastCalledWith(chats);
    });

    it('ignores a second move while one is in flight', () => {
        chatService.reorderChat.mockImplementation(() => new Promise(() => {
        }));

        const {container} = renderChatHistory({chats: mixedChats(), hasMore: false});

        dragRow(container, 2, 1);
        dragRow(container, 4, 1);

        expect(chatService.reorderChat).toHaveBeenCalledTimes(1);
    });

    it('moves a conversation with the arrow keys from its focused handle', async () => {
        const {container} = renderChatHistory({chats: mixedChats(), hasMore: false});

        pressDragHandle(container, 2, 'ArrowUp');

        await waitFor(() => expect(chatService.reorderChat).toHaveBeenCalledWith('chat-1', 0));
    });

    it('places a conversation that was still in date order on the first arrow keystroke', async () => {
        const {container} = renderChatHistory({chats: mixedChats(), hasMore: false});

        pressDragHandle(container, 4, 'ArrowUp');

        await waitFor(() => expect(chatService.reorderChat).toHaveBeenCalledWith('chat-2', 0));
    });

    it('ignores an arrow key at the end of the arrangement it points to', () => {
        const {container} = renderChatHistory({chats: mixedChats(), hasMore: false});

        pressDragHandle(container, 1, 'ArrowUp');

        expect(chatService.reorderChat).not.toHaveBeenCalled();
    });
});

function openDeleteDialog(container, rowIndex = 0) {
    openRowMenu(container, rowIndex);
    clickMenuItem('Delete');

    return document.body.querySelector('.delete-chat-dialog');
}

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
