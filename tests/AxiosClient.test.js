import { beforeEach, describe, it, expect, vi } from 'vitest';
import axiosClient from '../src/client/AxiosClient.js';
import axios from 'axios';

// Mock axios
vi.mock('axios', () => ({
    default: {
        create: vi.fn().mockReturnValue({
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
            patch: vi.fn(),
            interceptors: {
                request: { use: vi.fn() },
                response: { use: vi.fn() }
            }
        })
    }
}));

describe('AxiosClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should set auth header correctly', () => {
        const options = axiosClient.setAuthHeader('test-token');
        expect(options).toEqual({
            headers: {
                'Authorization': 'Bearer test-token'
            }
        });
    });

    it('should build URL with query parameters', () => {
        const baseUri = 'https://example.com/api';
        const queryParams = { param1: 'value1', param2: 'value2' };

        Object.defineProperty(window, 'location', {
            value: {
                origin: 'https://example.com'
            },
            writable: true
        });

        const result = axiosClient.buildUrl(baseUri, queryParams);
        expect(result).toContain('/api?param1=value1&param2=value2');
        expect(result).toContain('param1=value1');
        expect(result).toContain('param2=value2');
    });

    it('buildUrl returns baseUri unchanged when queryParams is falsy', () => {
        const baseUri = 'https://example.com/api';
        expect(axiosClient.buildUrl(baseUri, null)).toBe(baseUri);
        expect(axiosClient.buildUrl(baseUri, undefined)).toBe(baseUri);
    });

    it('should make a GET request and return a response', async () => {
        const mockResponse = { data: 'test' };
        axios.create().get.mockResolvedValueOnce({ data: mockResponse });

        const response = await axiosClient.get('https://example.com', {});

        expect(response).toEqual(mockResponse);
        expect(axios.create().get).toHaveBeenCalledTimes(1);
        expect(axios.create().get).toHaveBeenCalledWith('https://example.com', {});
    });

    it('should make a POST request and return a response', async () => {
        const mockResponse = { success: true };
        axios.create().post.mockResolvedValueOnce({ data: mockResponse });

        const data = { key: 'value' };
        const response = await axiosClient.post('https://example.com', data, {});

        expect(response).toEqual(mockResponse);
        expect(axios.create().post).toHaveBeenCalledTimes(1);
        expect(axios.create().post).toHaveBeenCalledWith('https://example.com', data, {});
    });

    it('put — success path returns response.data', async () => {
        const mockResponse = { updated: true };
        axios.create().put.mockResolvedValueOnce({ data: mockResponse });

        const response = await axiosClient.put('https://example.com/resource/1', { name: 'test' }, {});

        expect(response).toEqual(mockResponse);
        expect(axios.create().put).toHaveBeenCalledWith('https://example.com/resource/1', { name: 'test' }, {});
    });

    it('delete — success path returns response.data', async () => {
        const mockResponse = { deleted: true };
        axios.create().delete.mockResolvedValueOnce({ data: mockResponse });

        const response = await axiosClient.delete('https://example.com/resource/1', {});

        expect(response).toEqual(mockResponse);
        expect(axios.create().delete).toHaveBeenCalledWith('https://example.com/resource/1', {});
    });

    it('patch — success path returns response.data', async () => {
        const mockResponse = { patched: true };
        axios.create().patch.mockResolvedValueOnce({ data: mockResponse });

        const response = await axiosClient.patch('https://example.com/resource/1', { field: 'value' }, {});

        expect(response).toEqual(mockResponse);
        expect(axios.create().patch).toHaveBeenCalledWith('https://example.com/resource/1', { field: 'value' }, {});
    });

    it('should handle errors for failed requests', async () => {
        const errorResponse = {
            response: {
                status: 404,
                statusText: 'Not Found',
                data: { message: 'Resource not found' }
            }
        };

        axios.create().get.mockRejectedValueOnce(errorResponse);

        const response = await axiosClient.get('https://example.com', {});

        expect(response).toEqual({
            messageType: 'SYSTEM',
            message: '404: GET - https://example.com Resource not found'
        });
    });

    it('handleError — network error path throws AxiosClientError with requestMethod and requestUri', async () => {
        const networkError = {
            request: {},
            stack: 'stack trace',
        };
        axios.create().get.mockRejectedValueOnce(networkError);

        await expect(axiosClient.get('https://example.com/api', {})).rejects.toMatchObject({
            message: 'Network error or DNS issue',
            requestMethod: 'GET',
            requestUri: 'https://example.com/api',
        });
    });

    it('handleError — generic error path throws AxiosClientError', async () => {
        const genericError = {
            stack: 'stack trace',
        };
        axios.create().post.mockRejectedValueOnce(genericError);

        await expect(axiosClient.post('https://example.com/api', {}, {})).rejects.toMatchObject({
            message: 'Request failed',
            requestMethod: 'POST',
            requestUri: 'https://example.com/api',
        });
    });

    it('handleError — noOp flag returns undefined instead of throwing', async () => {
        const networkError = {request: {}};
        axios.create().get.mockRejectedValueOnce(networkError);

        const result = await axiosClient.get('https://example.com/api', {noOp: true});

        expect(result).toBeUndefined();
    });
});
