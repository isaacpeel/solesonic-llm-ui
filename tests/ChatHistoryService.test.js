import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import chatHistoryService from '../src/service/ChatService.js';
import axiosClient from '../src/client/AxiosClient.js';
import authClient from "../src/service/AuthService.js";

beforeEach(() => {
    vi.mock('../src/client/AxiosClient.js', () => ({
        default: {
            get: vi.fn().mockResolvedValue({chatHistory: []}),
            post: vi.fn().mockResolvedValue({success: true}),
            put: vi.fn().mockResolvedValue({success: true}),
            setAuthHeader: vi.fn().mockReturnValue({ headers: { 'Authorization': 'Bearer mock-access-token' } }),
            buildUrl: vi.fn().mockImplementation(uri => uri)
        }
    }));

    authClient.getAccessToken = vi.fn(async () => 'mock-access-token');
    authClient.getUserId = vi.fn(async () => 'mock-user-id')
    authClient.initializeUser = vi.fn().mockResolvedValue({
        tokens: {accessToken: 'mock-access-token'},
        userSub: 'mock-user-id',
    });

    vi.mock('../src/properties/ApplicationProperties', () => ({
        default: {
            chatsUri: 'https://api.example.com/chat',
            apiBaseUri: 'https://api.example.com',
        },
    }));

});

afterEach(() => {
    vi.clearAllMocks();
});

describe('chatHistoryClient', () => {
    it('should retrieve chat history successfully', async () => {
        const result = await chatHistoryService.findChatHistory();

        // Assertions
        expect(axiosClient.setAuthHeader).toHaveBeenCalledWith('mock-access-token');
        expect(axiosClient.get).toHaveBeenCalledWith(
            'https://api.example.com/chat/users/mock-user-id', 
            { headers: { 'Authorization': 'Bearer mock-access-token' } }
        );
        expect(result).toEqual({chatHistory: []});
    });
});
