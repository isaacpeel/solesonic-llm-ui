import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('../src/client/ApiClient.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../src/service/AuthService.js', () => ({
    default: {
        getUserId: vi.fn(),
    },
}));

vi.mock('../src/properties/ApplicationProperties', () => ({
    default: {
        apiBaseUri: 'https://api.example.com',
        chatsUri: 'https://api.example.com/chats',
        usersUri: 'https://api.example.com/users',
        documentsUri: 'https://api.example.com/documents',
    },
}));

import documentService from '../src/service/DocumentService.js';
import apiClient from '../src/client/ApiClient.js';
import authService from '../src/service/AuthService.js';

const pagedResponse = (content = [], page = {size: 20, number: 0, totalElements: 0, totalPages: 0}) => ({
    content,
    page,
});

beforeEach(() => {
    vi.clearAllMocks();
    authService.getUserId.mockResolvedValue('user-7');
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('collection resolution', () => {
    it('reads the global collection without a scope parameter', async () => {
        apiClient.get.mockResolvedValue(pagedResponse());

        await documentService.findIngestedDocuments('GLOBAL', {});

        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/documents/global?page=0&size=20');
    });

    it('reads the caller user collection by resolving the user id', async () => {
        apiClient.get.mockResolvedValue(pagedResponse());

        await documentService.findIngestedDocuments('USER', {});

        expect(authService.getUserId).toHaveBeenCalled();
        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/users/user-7/documents?page=0&size=20');
    });

    it('reads the chat collection from the chat id in the path', async () => {
        apiClient.get.mockResolvedValue(pagedResponse());

        await documentService.findIngestedDocuments('CHAT', {chatId: 'chat-42'});

        expect(apiClient.get).toHaveBeenCalledWith(
            'https://api.example.com/chats/chat-42/documents?page=0&size=20',
        );
    });

    it('never sends a scope query parameter', async () => {
        apiClient.get.mockResolvedValue(pagedResponse());

        await documentService.findIngestedDocuments('CHAT', {chatId: 'chat-42'});

        expect(apiClient.get.mock.calls[0][0]).not.toContain('scope=');
    });

    it('rejects an unknown scope', async () => {
        await expect(documentService.findIngestedDocuments('WORKSPACE', {})).rejects.toThrow(
            'Unknown retrieval scope: WORKSPACE',
        );
    });
});

describe('findIngestedDocuments', () => {
    it('returns the paged model rather than a bare array', async () => {
        const paged = pagedResponse(
            [{id: 'doc-1', fileName: 'guide.pdf'}],
            {size: 20, number: 0, totalElements: 42, totalPages: 3},
        );
        apiClient.get.mockResolvedValue(paged);

        const result = await documentService.findIngestedDocuments('GLOBAL', {});

        expect(result).toEqual(paged);
        expect(result.content).toHaveLength(1);
        expect(result.page.totalPages).toBe(3);
    });

    it('requests the page and size it is given', async () => {
        apiClient.get.mockResolvedValue(pagedResponse());

        await documentService.findIngestedDocuments('GLOBAL', {}, 2, 50);

        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/documents/global?page=2&size=50');
    });

    it('defaults to the first page at size 20', async () => {
        apiClient.get.mockResolvedValue(pagedResponse());

        await documentService.findIngestedDocuments('USER', {});

        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/users/user-7/documents?page=0&size=20');
    });
});

describe('uploadDocument', () => {
    it('posts to the collection with no scope or chatId form fields', async () => {
        const formData = new FormData();
        formData.append('file', 'contents');
        apiClient.post.mockResolvedValue(null);

        await documentService.uploadDocument(formData, 'USER', {});

        expect(formData.get('scope')).toBeNull();
        expect(formData.get('chatId')).toBeNull();
        expect(apiClient.post).toHaveBeenCalledWith(
            'https://api.example.com/users/user-7/documents',
            formData,
            {noOp: true},
        );
    });

    it('posts a chat upload to the chat collection', async () => {
        const formData = new FormData();
        apiClient.post.mockResolvedValue(null);

        await documentService.uploadDocument(formData, 'CHAT', {chatId: 'chat-42'});

        expect(formData.get('scope')).toBeNull();
        expect(formData.get('chatId')).toBeNull();
        expect(apiClient.post).toHaveBeenCalledWith(
            'https://api.example.com/chats/chat-42/documents',
            formData,
            {noOp: true},
        );
    });
});

describe('deleteIngestedDocument', () => {
    it('deletes within the global collection', async () => {
        apiClient.delete.mockResolvedValue(null);

        const result = await documentService.deleteIngestedDocument('doc-1', 'GLOBAL', {});

        expect(apiClient.delete).toHaveBeenCalledWith('https://api.example.com/documents/global/doc-1');
        expect(result).toBeNull();
    });

    it('deletes within the chat collection', async () => {
        apiClient.delete.mockResolvedValue(null);

        await documentService.deleteIngestedDocument('doc-1', 'CHAT', {chatId: 'chat-42'});

        expect(apiClient.delete).toHaveBeenCalledWith('https://api.example.com/chats/chat-42/documents/doc-1');
    });
});

describe('refreshIngestedDocument', () => {
    it('refreshes within the user collection', async () => {
        apiClient.post.mockResolvedValue(null);

        const result = await documentService.refreshIngestedDocument('doc-1', 'USER', {});

        expect(apiClient.post).toHaveBeenCalledWith('https://api.example.com/users/user-7/documents/doc-1/refresh');
        expect(result).toBeNull();
    });
});

describe('processDocumentQueue', () => {
    it('posts to the collection-less queue route', async () => {
        apiClient.post.mockResolvedValue(null);

        const result = await documentService.processDocumentQueue();

        expect(apiClient.post).toHaveBeenCalledWith('https://api.example.com/documents/processQueue');
        expect(result).toBeNull();
    });
});
