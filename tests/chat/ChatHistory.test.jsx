import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, fireEvent, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router';

vi.mock('../../src/hooks/usePagedChatHistory.js', () => ({
    default: vi.fn(),
}));

vi.mock('../../src/service/ChatService.js', () => ({
    default: {
        renameChat: vi.fn(),
    },
    DEFAULT_CHAT_HISTORY_PAGE_SIZE: 20,
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
import {SharedDataContext} from '../../src/context/SharedDataContext.jsx';
import usePagedChatHistory from '../../src/hooks/usePagedChatHistory.js';
import chatService from '../../src/service/ChatService.js';

const VIEWPORT_HEIGHT = 600;

const ROW_HEIGHT = 41;

/*
 * jsdom lays nothing out, so every element reports zero for the metrics @tanstack/virtual-core
 * actually reads — `offsetWidth`/`offsetHeight` (its ResizeObserver path never fires under test;
 * vitest.setup.js stubs the observer as a no-op). Feeding the scroll box and the rows real
 * numbers through those getters is what makes the windowing observable at all.
 */
function stubLayout() {
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');

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

function renderChatHistory({chats, hasMore = true, loading = false, error} = {}) {
    const loadMore = vi.fn();
    const retry = vi.fn();
    const setChatId = vi.fn();
    const setDrawerOpen = vi.fn();
    const replaceChat = vi.fn();
    const removeChat = vi.fn();

    usePagedChatHistory.mockReturnValue({
        chats,
        loading,
        error: error ?? null,
        hasMore,
        loadMore,
        retry,
        replaceChat,
        removeChat,
    });

    const sharedData = {
        reloadHistoryTrigger: 0,
        setChatId,
        chatInputRef: {current: null},
    };

    const renderResult = render(
        <MemoryRouter>
            <SharedDataContext.Provider value={sharedData}>
                <ChatHistory userId="user-1" drawerOpen={true} setDrawerOpen={setDrawerOpen}/>
            </SharedDataContext.Provider>
        </MemoryRouter>
    );

    return {...renderResult, loadMore, retry, setChatId, setDrawerOpen, replaceChat, removeChat};
}

let restoreLayout;

beforeEach(() => {
    restoreLayout = stubLayout();
    navigateSpy.mockReset();
    usePagedChatHistory.mockReset();
    chatService.renameChat.mockReset();
    chatService.renameChat.mockResolvedValue({id: 'chat-0', name: 'Trip planning'});
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
        expect(menu.textContent).toBe('Rename');
        expect(setChatId).not.toHaveBeenCalled();
        expect(setDrawerOpen).not.toHaveBeenCalled();
        expect(navigateSpy).not.toHaveBeenCalled();
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
