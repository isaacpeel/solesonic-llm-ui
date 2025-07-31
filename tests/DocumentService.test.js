import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import documentService from '../src/service/DocumentService.js';
import axiosClient from '../src/client/AxiosClient.js';
import authClient from "../src/service/AuthService.js";

beforeEach(() => {
    vi.mock('../src/client/AxiosClient.js', () => ({
        default: {
            get: vi.fn().mockResolvedValue({trainingDocument: []}),
            post: vi.fn().mockResolvedValue({}),
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
            chatUri: 'https://api.example.com/chat',
            apiBaseUri: 'https://api.example.com',
        },
    }));

});

afterEach(() => {
    vi.clearAllMocks();
});

describe('findTrainingDocuments', () => {
    it('should retrieve training documents successfully', async () => {
        const result = await documentService.findTrainingDocuments();

        expect(axiosClient.setAuthHeader).toHaveBeenCalledWith('mock-access-token');
        expect(axiosClient.get).toHaveBeenCalledWith(
            'https://api.example.com/trainingdocuments', 
            { headers: { 'Authorization': 'Bearer mock-access-token' } }
        );
        expect(result).toEqual({trainingDocument: []});
    });
});

describe('uploadDocument', () => {
    it('should upload training document successfully', async () => {
        const fakeFileBuffer = globalThis.Buffer.from('This is a test file content.');

        const result = await documentService.uploadDocument(fakeFileBuffer);

        expect(axiosClient.setAuthHeader).toHaveBeenCalledWith('mock-access-token');
        expect(axiosClient.post).toHaveBeenCalledWith(
            'https://api.example.com/documents/data/upload', 
            fakeFileBuffer, 
            { 
                ...{ headers: { 'Authorization': 'Bearer mock-access-token' } },
                noOp: true 
            }
        );
        expect(result).toEqual({});
    });
});
