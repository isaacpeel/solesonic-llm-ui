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

    // The CHAT collection is the caller's, not the conversation's — chatId is a filter on the
    // shared collection root, not a path segment, so a chat document is retrievable by chat but
    // managed by whoever uploaded it.
    it('reads the shared chat collection filtered by chatId', async () => {
        apiClient.get.mockResolvedValue(pagedResponse());

        await documentService.findIngestedDocuments('CHAT', {chatId: 'chat-42'});

        expect(apiClient.get).toHaveBeenCalledWith(
            'https://api.example.com/chats/documents?page=0&size=20&chatId=chat-42',
        );
    });

    // Omitting the filter would return every conversation the caller has ever uploaded to,
    // rather than just this one.
    it('omits the chatId filter when no chat is active', async () => {
        apiClient.get.mockResolvedValue(pagedResponse());

        await documentService.findIngestedDocuments('CHAT', {});

        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/chats/documents?page=0&size=20');
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
        );
    });

    it('posts a chat upload to the shared chat collection with chatId as a query filter', async () => {
        const formData = new FormData();
        apiClient.post.mockResolvedValue(null);

        await documentService.uploadDocument(formData, 'CHAT', {chatId: 'chat-42'});

        expect(formData.get('scope')).toBeNull();
        expect(formData.get('chatId')).toBeNull();
        expect(apiClient.post).toHaveBeenCalledWith(
            'https://api.example.com/chats/documents?chatId=chat-42',
            formData,
        );
    });

    // A rejected upload must reach the caller. Swallowing it renders "uploaded successfully"
    // over a 403 or a 413.
    it('propagates a rejected upload rather than swallowing it', async () => {
        const formData = new FormData();
        const rejection = new Error('403: POST - /documents/global Forbidden');
        rejection.status = 403;
        apiClient.post.mockRejectedValue(rejection);

        await expect(documentService.uploadDocument(formData, 'GLOBAL', {})).rejects.toThrow('Forbidden');
    });
});

describe('deleteIngestedDocument', () => {
    it('deletes within the global collection', async () => {
        apiClient.delete.mockResolvedValue(null);

        const result = await documentService.deleteIngestedDocument('doc-1', 'GLOBAL');

        expect(apiClient.delete).toHaveBeenCalledWith('https://api.example.com/documents/global/doc-1');
        expect(result).toBeNull();
    });

    // No chatId in the path — ownership of a chat document lives with whoever uploaded it, not
    // with the conversation, so the collection root alone resolves it.
    it('deletes within the shared chat collection without a chatId', async () => {
        apiClient.delete.mockResolvedValue(null);

        await documentService.deleteIngestedDocument('doc-1', 'CHAT');

        expect(apiClient.delete).toHaveBeenCalledWith('https://api.example.com/chats/documents/doc-1');
    });
});

describe('refreshIngestedDocument', () => {
    it('refreshes within the user collection', async () => {
        apiClient.post.mockResolvedValue(null);

        const result = await documentService.refreshIngestedDocument('doc-1', 'USER');

        expect(apiClient.post).toHaveBeenCalledWith('https://api.example.com/users/user-7/documents/doc-1/refresh');
        expect(result).toBeNull();
    });

    it('refreshes within the shared chat collection without a chatId', async () => {
        apiClient.post.mockResolvedValue(null);

        await documentService.refreshIngestedDocument('doc-1', 'CHAT');

        expect(apiClient.post).toHaveBeenCalledWith('https://api.example.com/chats/documents/doc-1/refresh');
    });
});

describe('promoteDocument', () => {
    it('promotes a chat document into the caller\'s own collection', async () => {
        apiClient.post.mockResolvedValue(null);

        const result = await documentService.promoteDocument('doc-1', 'CHAT', 'user');

        expect(apiClient.post).toHaveBeenCalledWith('https://api.example.com/chats/documents/doc-1/promote/user');
        expect(result).toBeNull();
    });

    it('promotes a chat document into the global collection', async () => {
        apiClient.post.mockResolvedValue(null);

        await documentService.promoteDocument('doc-1', 'CHAT', 'global');

        expect(apiClient.post).toHaveBeenCalledWith('https://api.example.com/chats/documents/doc-1/promote/global');
    });

    // A rag-admin can promote one of their own USER-collection documents straight to global.
    it('promotes a user document into the global collection', async () => {
        apiClient.post.mockResolvedValue(null);

        await documentService.promoteDocument('doc-1', 'USER', 'global');

        expect(authService.getUserId).toHaveBeenCalled();
        expect(apiClient.post).toHaveBeenCalledWith('https://api.example.com/users/user-7/documents/doc-1/promote/global');
    });

    it('propagates a conflict rather than swallowing it', async () => {
        const rejection = new Error('409: POST - /chats/documents/doc-1/promote/global Conflict');
        rejection.status = 409;
        apiClient.post.mockRejectedValue(rejection);

        await expect(documentService.promoteDocument('doc-1', 'CHAT', 'global')).rejects.toThrow('Conflict');
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
