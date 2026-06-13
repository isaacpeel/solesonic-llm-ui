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

describe('findTrainingDocuments', () => {
    it('calls apiClient.get with the training documents URI and returns the result', async () => {
        apiClient.get.mockResolvedValue({trainingDocument: []});

        const result = await documentService.findTrainingDocuments();

        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/trainingdocuments');
        expect(result).toEqual({trainingDocument: []});
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
