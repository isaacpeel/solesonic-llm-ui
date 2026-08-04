import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, fireEvent, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router';

vi.mock('../../src/hooks/usePagedChatHistory.js', () => ({
    default: vi.fn(),
}));

const navigateSpy = vi.fn();

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal();

    return {...actual, useNavigate: () => navigateSpy};
});

import ChatHistory from '../../src/chat/ChatHistory.jsx';
import {SharedDataContext} from '../../src/context/SharedDataContext.jsx';
import usePagedChatHistory from '../../src/hooks/usePagedChatHistory.js';

const VIEWPORT_HEIGHT = 600;

const ROW_HEIGHT = 41;

/*
 * jsdom lays nothing out, so every element reports a zero-sized rect and the virtualizer would
 * window against a zero-height viewport. Feeding the scroll box and the rows real numbers is what
 * makes the windowing observable at all.
 */
function stubLayout() {
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

    /** @this {Element} */
    Element.prototype.getBoundingClientRect = function stubbedGetBoundingClientRect() {
        if (this.classList.contains('chat-history-scroll')) {
            return rectOf(250, VIEWPORT_HEIGHT);
        }

        if (this.classList.contains('chat-history-row')) {
            return rectOf(250, ROW_HEIGHT);
        }

        return rectOf(0, 0);
    };

    return () => {
        Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    };
}

function rectOf(width, height) {
    return {
        width,
        height,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
    };
}

/* All on one day, so the list is a single header plus one row per chat. */
function chatsOf(count) {
    return Array.from({length: count}, (unused, index) => ({
        id: `chat-${index}`,
        timestamp: '2026-08-03T10:00:00.000-06:00',
        chatMessages: [{message: `Message number ${index}`}],
    }));
}

function renderChatHistory({chats, hasMore = true, loading = false, error} = {}) {
    const loadMore = vi.fn();
    const retry = vi.fn();
    const setChatId = vi.fn();
    const setDrawerOpen = vi.fn();

    usePagedChatHistory.mockReturnValue({chats, loading, error: error ?? null, hasMore, loadMore, retry});

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

    return {...renderResult, loadMore, retry, setChatId, setDrawerOpen};
}

let restoreLayout;

beforeEach(() => {
    restoreLayout = stubLayout();
    navigateSpy.mockReset();
    usePagedChatHistory.mockReset();
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

describe('ChatHistory selection', () => {
    it('opens the picked chat and closes the drawer', () => {
        const {container, setChatId, setDrawerOpen} = renderChatHistory({chats: chatsOf(5)});

        fireEvent.click(container.querySelectorAll('.chat-item')[2]);

        expect(setChatId).toHaveBeenCalledWith('chat-2');
        expect(setDrawerOpen).toHaveBeenCalledWith(false);
        expect(navigateSpy).toHaveBeenCalledWith('/');
    });
});
