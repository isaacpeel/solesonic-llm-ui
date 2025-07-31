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
            patch: vi.fn()
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
        
        // Mock window.location.origin
        Object.defineProperty(window, 'location', {
            value: {
                origin: 'https://example.com'
            },
            writable: true
        });
        
        const result = axiosClient.buildUrl(baseUri, queryParams);
        expect(result).toContain('https://example.com/api');
        expect(result).toContain('param1=value1');
        expect(result).toContain('param2=value2');
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
});