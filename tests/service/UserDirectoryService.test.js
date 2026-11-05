import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('../../src/client/ApiClient.js', async (importOriginal) => ({
    ...await importOriginal(),
    default: {get: vi.fn()},
}));

vi.mock('../../src/properties/ApplicationProperties.jsx', () => ({
    default: {userDirectoryUri: 'https://api.example.com/users/directory'},
}));

import userDirectoryService, {DIRECTORY_PAGE_SIZE} from '../../src/service/UserDirectoryService.js';
import apiClient from '../../src/client/ApiClient.js';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('UserDirectoryService', () => {
    it('searches the directory with the query and a limit', async () => {
        apiClient.get.mockResolvedValue([{userId: 'u1', username: 'alice', displayName: 'Alice'}]);

        const found = await userDirectoryService.search('ali', {limit: 5});

        expect(found).toEqual([{userId: 'u1', username: 'alice', displayName: 'Alice'}]);
        const [uri] = apiClient.get.mock.calls[0];
        expect(uri).toContain('https://api.example.com/users/directory');
        expect(uri).toContain('q=ali');
        expect(uri).toContain('limit=5');
    });

    it('defaults to an empty query and the default page size', async () => {
        apiClient.get.mockResolvedValue([]);

        await userDirectoryService.search();

        const [uri] = apiClient.get.mock.calls[0];
        expect(uri).toContain('q=');
        expect(uri).toContain(`limit=${DIRECTORY_PAGE_SIZE}`);
    });

    it('encodes special characters in the query', async () => {
        apiClient.get.mockResolvedValue([]);

        await userDirectoryService.search('a&b=c é😀');

        const [uri] = apiClient.get.mock.calls[0];
        expect(uri).not.toContain('a&b');
        expect(new URL(uri, 'http://x').searchParams.get('q')).toBe('a&b=c é😀');
    });

    it('hands the abort signal to the request', async () => {
        apiClient.get.mockResolvedValue([]);
        const controller = new AbortController();

        await userDirectoryService.search('a', {signal: controller.signal});

        expect(apiClient.get.mock.calls[0][1]).toEqual({signal: controller.signal});
    });

    it('answers an empty list when the server answers nothing', async () => {
        apiClient.get.mockResolvedValue(null);

        expect(await userDirectoryService.search('a')).toEqual([]);
    });
});
