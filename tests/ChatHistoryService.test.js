import {describe, it, expect, vi, afterEach} from 'vitest';

vi.mock('../src/client/ApiClient.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({success: true}),
        put: vi.fn().mockResolvedValue({success: true}),
    },
}));

vi.mock('../src/service/AuthService.js', () => ({
    default: {
        getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
        getUserId: vi.fn().mockResolvedValue('mock-user-id'),
    },
}));

vi.mock('../src/properties/ApplicationProperties', () => ({
    default: {
        chatsUri: 'https://api.example.com/chat',
        apiBaseUri: 'https://api.example.com',
    },
}));

import chatHistoryService, {
    DEFAULT_CHAT_HISTORY_PAGE_SIZE,
    normalizeChatHistoryPage,
} from '../src/service/ChatService.js';
import apiClient from '../src/client/ApiClient.js';

function springPage({content = [], number = 0, totalElements = 0, totalPages = 1, last = true} = {}) {
    return {
        content,
        number,
        size: DEFAULT_CHAT_HISTORY_PAGE_SIZE,
        totalElements,
        totalPages,
        first: number === 0,
        last,
        numberOfElements: content.length,
        empty: content.length === 0,
    };
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('findChatHistory', () => {
    it('requests the first page with the default size and flattens the Page', async () => {
        apiClient.get.mockResolvedValue(springPage({
            content: [{id: 'chat-1'}],
            totalElements: 1,
            totalPages: 1,
        }));

        const result = await chatHistoryService.findChatHistory();

        expect(apiClient.get).toHaveBeenCalledWith(
            `https://api.example.com/chat/users/mock-user-id?page=0&size=${DEFAULT_CHAT_HISTORY_PAGE_SIZE}`,
        );
        expect(result).toEqual({
            chats: [{id: 'chat-1'}],
            page: 0,
            last: true,
            totalPages: 1,
            totalElements: 1,
        });
    });

    it('passes the requested page and size through as query parameters', async () => {
        apiClient.get.mockResolvedValue(springPage({
            content: [{id: 'chat-9'}],
            number: 3,
            totalElements: 40,
            totalPages: 8,
            last: false,
        }));

        const result = await chatHistoryService.findChatHistory({page: 3, size: 5});

        expect(apiClient.get).toHaveBeenCalledWith(
            'https://api.example.com/chat/users/mock-user-id?page=3&size=5',
        );
        expect(result.page).toBe(3);
        expect(result.last).toBe(false);
    });
});

describe('normalizeChatHistoryPage', () => {
    it('derives last from the page counters when the flag is absent', () => {
        const normalized = normalizeChatHistoryPage({
            content: [{id: 'chat-1'}],
            number: 2,
            totalPages: 3,
        });

        expect(normalized.last).toBe(true);
    });

    it('reports more pages when the counters say the page is not the final one', () => {
        const normalized = normalizeChatHistoryPage({
            content: [{id: 'chat-1'}],
            number: 0,
            totalPages: 3,
        });

        expect(normalized.last).toBe(false);
    });

    it('terminates on an empty page even when the page claims more remain', () => {
        const normalized = normalizeChatHistoryPage(springPage({content: [], totalPages: 9, last: false}));

        expect(normalized.chats).toEqual([]);
        expect(normalized.last).toBe(true);
    });

    /* What the backend actually sends: PagedModel, with the counters nested under `page`. */
    it('reads the counters when they are nested under a page object', () => {
        const normalized = normalizeChatHistoryPage({
            content: [{id: 'chat-1'}],
            page: {size: 20, number: 0, totalElements: 688, totalPages: 35},
        });

        expect(normalized.page).toBe(0);
        expect(normalized.totalPages).toBe(35);
        expect(normalized.totalElements).toBe(688);
        expect(normalized.last).toBe(false);
    });

    it('marks the final nested-counter page as last instead of asking for one more', () => {
        const normalized = normalizeChatHistoryPage({
            content: [{id: 'chat-1'}],
            page: {size: 20, number: 34, totalElements: 688, totalPages: 35},
        });

        expect(normalized.last).toBe(true);
    });

    it('falls back to an empty terminal page for an unusable response', () => {
        const normalized = normalizeChatHistoryPage(null, 4);

        expect(normalized).toEqual({
            chats: [],
            page: 4,
            last: true,
            totalPages: null,
            totalElements: null,
        });
    });
});
