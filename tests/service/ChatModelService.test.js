import {describe, it, expect, vi, afterEach} from 'vitest';

vi.mock('../../src/client/ApiClient.js', () => ({
    default: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(null),
    },
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {
        chatsUri: 'https://api.example.com/chats',
        chatModelsUri: 'https://api.example.com/chats/models',
    },
}));

import apiClient from '../../src/client/ApiClient.js';
import chatModelService from '../../src/service/ChatModelService.js';

afterEach(() => {
    vi.clearAllMocks();
});

describe('ChatModelService', () => {
    it('lists the options without a chat id for a new chat', async () => {
        const modelOptions = {models: [{id: 'qwen3-8b', ownedBy: 'local'}], defaultModel: 'qwen3-8b', selectedModel: null, activeAgent: null};
        apiClient.get.mockResolvedValue(modelOptions);

        const result = await chatModelService.options(null);

        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/chats/models');
        expect(result).toBe(modelOptions);
    });

    it('lists the options for an existing chat with an encoded chatId query parameter', async () => {
        await chatModelService.options('chat 1/../x');

        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/chats/models?chatId=chat+1%2F..%2Fx');
    });

    it('selects a model with a PUT to the encoded chat model path', async () => {
        await chatModelService.select('../admin', 'openai/gpt-4o');

        expect(apiClient.put).toHaveBeenCalledWith('https://api.example.com/chats/..%2Fadmin/model', {model: 'openai/gpt-4o'});
    });

    it('resets to the default with a DELETE to the encoded chat model path', async () => {
        await chatModelService.reset('chat-1');

        expect(apiClient.delete).toHaveBeenCalledWith('https://api.example.com/chats/chat-1/model');
    });
});
