import {describe, it, expect, vi, afterEach} from 'vitest';

vi.mock('../../src/client/ApiClient.js', () => ({
    default: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {
        llmKeysUri: 'https://api.example.com/llm-keys',
    },
}));

import apiClient from '../../src/client/ApiClient.js';
import llmKeyService, {LLM_KEY_PAGE_SIZE} from '../../src/service/LlmKeyService.js';

const USER_ID = 'user/with space';
const ENCODED_USER_ID = encodeURIComponent(USER_ID);

afterEach(() => {
    vi.clearAllMocks();
});

describe('llmKeyService', () => {
    it('pages the key list with the default size', async () => {
        const paged = {content: [], page: {size: 50, number: 0, totalElements: 0, totalPages: 0}};
        apiClient.get.mockResolvedValue(paged);

        await expect(llmKeyService.findKeys()).resolves.toBe(paged);

        expect(LLM_KEY_PAGE_SIZE).toBe(50);
        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/llm-keys?page=0&size=50');
    });

    it('passes an explicit page and size', async () => {
        await llmKeyService.findKeys(3, 10);

        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/llm-keys?page=3&size=10');
    });

    it('finds one key by encoded user id', async () => {
        await llmKeyService.findKey(USER_ID);

        expect(apiClient.get).toHaveBeenCalledWith(`https://api.example.com/llm-keys/${ENCODED_USER_ID}`);
    });

    it('registers a key with a body of exactly the api key', async () => {
        const summary = {userId: USER_ID, keyHint: '1234'};
        apiClient.put.mockResolvedValue(summary);

        await expect(llmKeyService.registerKey(USER_ID, 'sk-abcdefghijkl1234')).resolves.toBe(summary);

        expect(apiClient.put).toHaveBeenCalledWith(
            `https://api.example.com/llm-keys/${ENCODED_USER_ID}`,
            {apiKey: 'sk-abcdefghijkl1234'},
        );
        expect(Object.keys(apiClient.put.mock.calls[0][1])).toEqual(['apiKey']);
    });

    it('removes a key by encoded user id', async () => {
        apiClient.delete.mockResolvedValue(null);

        await llmKeyService.removeKey(USER_ID);

        expect(apiClient.delete).toHaveBeenCalledWith(`https://api.example.com/llm-keys/${ENCODED_USER_ID}`);
    });
});
