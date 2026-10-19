import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('../../src/client/ApiClient.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getUserId: vi.fn(),
    },
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {
        apiBaseUri: 'https://api.example.com',
        usersUri: 'https://api.example.com/users',
        memoriesUri: 'https://api.example.com/memories',
    },
}));

import memoryService, {ADMIN_PAGE_SIZE} from '../../src/service/MemoryService.js';
import apiClient from '../../src/client/ApiClient.js';
import authService from '../../src/service/AuthService.js';

beforeEach(() => {
    vi.clearAllMocks();
    authService.getUserId.mockResolvedValue('user-7');
});

describe('MemoryService owner endpoints', () => {
    it('lists the caller\'s memories by default', async () => {
        apiClient.get.mockResolvedValue([]);

        await memoryService.findMemories();

        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/users/user-7/memories');
    });

    it('lets an explicit userId override the caller', async () => {
        apiClient.get.mockResolvedValue([]);

        await memoryService.findMemories('user-9');

        expect(authService.getUserId).not.toHaveBeenCalled();
        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/users/user-9/memories');
    });

    it('creates a memory with only kind and content', async () => {
        apiClient.post.mockResolvedValue({id: 'memory-1'});

        await memoryService.createMemory({kind: 'FACT', content: 'Lives in Denver', extra: 'ignored'});

        expect(apiClient.post).toHaveBeenCalledWith(
            'https://api.example.com/users/user-7/memories',
            {kind: 'FACT', content: 'Lives in Denver'},
        );
    });

    it('patches only the keys it is given', async () => {
        apiClient.patch.mockResolvedValue({id: 'memory-1'});

        await memoryService.updateMemory('memory-1', {content: 'Prefers tea'});

        expect(apiClient.patch).toHaveBeenCalledWith(
            'https://api.example.com/users/user-7/memories/memory-1',
            {content: 'Prefers tea'},
        );
    });

    it('drops keys whose value is undefined from a patch', async () => {
        apiClient.patch.mockResolvedValue({id: 'memory-1'});

        await memoryService.updateMemory('memory-1', {content: undefined, kind: 'PREFERENCE'}, 'user-9');

        expect(apiClient.patch).toHaveBeenCalledWith(
            'https://api.example.com/users/user-9/memories/memory-1',
            {kind: 'PREFERENCE'},
        );
    });

    it('deletes one memory on behalf of an explicit owner', async () => {
        apiClient.delete.mockResolvedValue(null);

        await memoryService.deleteMemory('memory-1', 'user-9');

        expect(apiClient.delete).toHaveBeenCalledWith('https://api.example.com/users/user-9/memories/memory-1');
    });

    it('encodes ids placed in the path', async () => {
        apiClient.delete.mockResolvedValue(null);

        await memoryService.deleteMemory('../memory?x=1', 'user/9');

        expect(apiClient.delete).toHaveBeenCalledWith(
            'https://api.example.com/users/user%2F9/memories/..%2Fmemory%3Fx%3D1',
        );
    });

    it('deletes every memory of the caller', async () => {
        apiClient.delete.mockResolvedValue(null);

        await memoryService.deleteAllMemories();

        expect(apiClient.delete).toHaveBeenCalledWith('https://api.example.com/users/user-7/memories');
    });
});

describe('MemoryService admin endpoints', () => {
    it('pages all memories at the server default size', async () => {
        apiClient.get.mockResolvedValue({content: [], page: {}});

        await memoryService.findAllMemories();

        expect(ADMIN_PAGE_SIZE).toBe(50);
        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/memories?page=0&size=50');
    });

    it('appends repeated status, kind and sort parameters rather than joining them', async () => {
        apiClient.get.mockResolvedValue({content: [], page: {}});

        await memoryService.findAllMemories({
            userId: 'user-9',
            statuses: ['ACTIVE', 'PENDING'],
            kinds: ['FACT', 'PREFERENCE'],
            sorts: ['userId,asc', 'updated,desc'],
        }, 2, 25);

        const requestedUri = apiClient.get.mock.calls[0][0];
        const searchParams = new URL(requestedUri).searchParams;

        expect(requestedUri.startsWith('https://api.example.com/memories?')).toBe(true);
        expect(searchParams.get('userId')).toBe('user-9');
        expect(searchParams.getAll('status')).toEqual(['ACTIVE', 'PENDING']);
        expect(searchParams.getAll('kind')).toEqual(['FACT', 'PREFERENCE']);
        expect(searchParams.getAll('sort')).toEqual(['userId,asc', 'updated,desc']);
        expect(searchParams.get('page')).toBe('2');
        expect(searchParams.get('size')).toBe('25');
    });

    it('omits an empty userId filter', async () => {
        apiClient.get.mockResolvedValue({content: [], page: {}});

        await memoryService.findAllMemories({userId: ''});

        expect(apiClient.get.mock.calls[0][0]).not.toContain('userId');
    });

    it('reads reflections from /memories/reflections', async () => {
        apiClient.get.mockResolvedValue({content: [], page: {}});

        await memoryService.findReflections({statuses: ['FAILED'], sorts: ['attempts,desc']});

        const requestedUri = apiClient.get.mock.calls[0][0];
        const searchParams = new URL(requestedUri).searchParams;

        expect(requestedUri.startsWith('https://api.example.com/memories/reflections?')).toBe(true);
        expect(searchParams.getAll('status')).toEqual(['FAILED']);
        expect(searchParams.getAll('sort')).toEqual(['attempts,desc']);
        expect(searchParams.get('size')).toBe('50');
    });

    it('reads the processing status from /memories/status', async () => {
        apiClient.get.mockResolvedValue({});

        await memoryService.getProcessingStatus();

        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/memories/status');
    });
});
