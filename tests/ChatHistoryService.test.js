import {describe, it, expect, vi, afterEach} from 'vitest';

vi.mock('../src/client/ApiClient.js', () => ({
    default: {
        get: vi.fn().mockResolvedValue({chatHistory: []}),
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

import chatHistoryService from '../src/service/ChatService.js';
import apiClient from '../src/client/ApiClient.js';

afterEach(() => {
    vi.clearAllMocks();
});

describe('chatHistoryClient', () => {
    it('should retrieve chat history successfully', async () => {
        const result = await chatHistoryService.findChatHistory();

        expect(apiClient.get).toHaveBeenCalledWith(
            'https://api.example.com/chat/users/mock-user-id',
        );
        expect(result).toEqual({chatHistory: []});
    });
});
