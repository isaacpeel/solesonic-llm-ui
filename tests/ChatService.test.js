import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import chatService from '../src/service/ChatService.js';
import axiosClient from '../src/client/AxiosClient.js';
import authClient from "../src/service/AuthService.js";

beforeEach(() => {
    vi.mock('../src/client/AxiosClient.js', () => ({
        default: {
            get: vi.fn().mockResolvedValue({chatDetails: {}}),
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

describe('chatClient', () => {
    it('should send a chat message to an existing chat successfully', async () => {
        const userMessage = 'Hello, world!';
        const chatId = '12345';

        const result = await chatService.chat(userMessage, chatId);

        // Assertions
        expect(axiosClient.setAuthHeader).toHaveBeenCalledWith('mock-access-token');
        expect(axiosClient.put).toHaveBeenCalledWith(
            'https://api.example.com/chat/12345', 
            {chatMessage: userMessage}, 
            { headers: { 'Authorization': 'Bearer mock-access-token' } }
        );
        expect(result).toEqual({success: true});
    });

    it('should create a new chat when chatId is not provided', async () => {
        const userMessage = 'Hello, world!';
        // No chatId provided

        const result = await chatService.chat(userMessage);

        // Assertions
        expect(axiosClient.setAuthHeader).toHaveBeenCalledWith('mock-access-token');
        expect(axiosClient.post).toHaveBeenCalledWith(
            'https://api.example.com/chat/users/mock-user-id', 
            {chatMessage: userMessage}, 
            { headers: { 'Authorization': 'Bearer mock-access-token' } }
        );
        expect(result).toEqual({success: true});
    });

    it('should retrieve chat details successfully', async () => {
        const chatId = '67890';

        const result = await chatService.findChatDetails(chatId);

        // Assertions
        expect(axiosClient.setAuthHeader).toHaveBeenCalledWith('mock-access-token');
        expect(axiosClient.get).toHaveBeenCalledWith(
            'https://api.example.com/chat/67890', 
            { headers: { 'Authorization': 'Bearer mock-access-token' } }
        );
        expect(result).toEqual({chatDetails: {}});
    });
});
