import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('../src/client/ApiClient.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../src/properties/ApplicationProperties', () => ({
    default: {
        chatUri: 'https://api.example.com/chat',
        apiBaseUri: 'https://api.example.com',
    },
}));

import documentService from '../src/service/DocumentService.js';
import apiClient from '../src/client/ApiClient.js';

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('findIngestedDocuments', () => {
    it('calls apiClient.get with the ingested documents URI and returns the result', async () => {
        apiClient.get.mockResolvedValue({ingestedDocument: []});

        const result = await documentService.findIngestedDocuments();

        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/documents/ingested');
        expect(result).toEqual({ingestedDocument: []});
    });
});

describe('deleteIngestedDocument', () => {
    it('calls apiClient.delete with the ingested document URI', async () => {
        apiClient.delete.mockResolvedValue(null);

        const result = await documentService.deleteIngestedDocument('doc-1');

        expect(apiClient.delete).toHaveBeenCalledWith('https://api.example.com/documents/ingested/doc-1');
        expect(result).toBeNull();
    });
});

describe('refreshIngestedDocument', () => {
    it('calls apiClient.post with the ingested document refresh URI', async () => {
        apiClient.post.mockResolvedValue(null);

        const result = await documentService.refreshIngestedDocument('doc-1');

        expect(apiClient.post).toHaveBeenCalledWith('https://api.example.com/documents/ingested/doc-1/refresh');
        expect(result).toBeNull();
    });
});

describe('processDocumentQueue', () => {
    it('calls apiClient.post with the ingested documents process queue URI', async () => {
        apiClient.post.mockResolvedValue(null);

        const result = await documentService.processDocumentQueue();

        expect(apiClient.post).toHaveBeenCalledWith('https://api.example.com/documents/ingested/processQueue');
        expect(result).toBeNull();
    });
});

describe('uploadDocument', () => {
    it('calls apiClient.post with the file and noOp option', async () => {
        const fakeFormData = new FormData();
        apiClient.post.mockResolvedValue(null);

        const result = await documentService.uploadDocument(fakeFormData);

        expect(apiClient.post).toHaveBeenCalledWith(
            'https://api.example.com/documents/data/upload',
            fakeFormData,
            {noOp: true},
        );
        expect(result).toBeNull();
    });
});
