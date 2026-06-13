import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/service/AuthService.js', () => ({
    default: {
        getAccessToken: vi.fn(),
    },
}));

vi.stubGlobal('fetch', vi.fn());

import apiClient, { ApiError, buildUrl } from '../src/client/ApiClient.js';
import authService from '../src/service/AuthService.js';

function makeResponse(status, body, contentType = 'application/json') {
    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : status === 204 ? 'No Content' : status === 401 ? 'Unauthorized' : status === 500 ? 'Internal Server Error' : 'Error',
        headers: {
            get: (name) => name.toLowerCase() === 'content-type' ? contentType : null,
        },
        json: () => Promise.resolve(JSON.parse(bodyString)),
    };
}

beforeEach(() => {
    authService.getAccessToken.mockResolvedValue('tok');
    vi.mocked(fetch).mockReset();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('ApiClient', () => {
    it('injects auth header on request', async () => {
        vi.mocked(fetch).mockResolvedValue(makeResponse(200, { id: 1 }));

        await apiClient.get('/api/test');

        expect(fetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
            headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        }));
    });

    it('401 retry — calls fetch twice, second with refreshed token', async () => {
        authService.getAccessToken
            .mockResolvedValueOnce('old-tok')
            .mockResolvedValueOnce('new-tok');

        vi.mocked(fetch)
            .mockResolvedValueOnce(makeResponse(401, {}))
            .mockResolvedValueOnce(makeResponse(200, { ok: true }));

        await apiClient.get('/api/test');

        expect(fetch).toHaveBeenCalledTimes(2);
        const secondCall = vi.mocked(fetch).mock.calls[1];
        expect(secondCall[1].headers.Authorization).toBe('Bearer new-tok');
    });

    it('401 retry limit — throws ApiError with status 401 after second attempt', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(makeResponse(401, {}))
            .mockResolvedValueOnce(makeResponse(401, {}));

        const error = await apiClient.get('/api/test').catch((error) => error);
        expect(error).toBeInstanceOf(ApiError);
        expect(error.status).toBe(401);
    });

    it('HTTP 500 error throws ApiError with message from body', async () => {
        vi.mocked(fetch).mockResolvedValue(makeResponse(500, { message: 'Server error' }));

        await expect(apiClient.get('/api/test')).rejects.toSatisfy((error) => {
            return error instanceof ApiError && error.message.includes('500') && error.message.includes('Server error');
        });
    });

    it('HTTP 500 error body not JSON — throws ApiError with statusText', async () => {
        const response = {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: { get: () => 'application/json' },
            json: () => Promise.reject(new SyntaxError('bad json')),
        };
        vi.mocked(fetch).mockResolvedValue(response);

        await expect(apiClient.get('/api/test')).rejects.toSatisfy((error) => {
            return error instanceof ApiError && error.message.includes('Internal Server Error');
        });
    });

    it('200 returns parsed JSON', async () => {
        vi.mocked(fetch).mockResolvedValue(makeResponse(200, { id: 1 }));

        const result = await apiClient.get('/api/test');

        expect(result).toEqual({ id: 1 });
    });

    it('204 returns null', async () => {
        vi.mocked(fetch).mockResolvedValue(makeResponse(204, '', 'application/json'));

        const result = await apiClient.delete('/api/test');

        expect(result).toBeNull();
    });

    it('non-JSON content-type returns null without throwing', async () => {
        vi.mocked(fetch).mockResolvedValue(makeResponse(200, 'plain text', 'text/plain'));

        const result = await apiClient.get('/api/test');

        expect(result).toBeNull();
    });

    it('noOp: true on error returns null without throwing', async () => {
        vi.mocked(fetch).mockResolvedValue(makeResponse(404, { message: 'Not found' }));

        const result = await apiClient.get('/api/test', { noOp: true });

        expect(result).toBeNull();
    });

    it('FormData body — fetch called without Content-Type header', async () => {
        vi.mocked(fetch).mockResolvedValue(makeResponse(200, { ok: true }));
        const formData = new FormData();

        await apiClient.post('/api/upload', formData);

        const callHeaders = vi.mocked(fetch).mock.calls[0][1].headers;
        expect(callHeaders['Content-Type']).toBeUndefined();
    });

    it('JSON body — sets Content-Type application/json', async () => {
        vi.mocked(fetch).mockResolvedValue(makeResponse(200, { ok: true }));

        await apiClient.post('/api/test', { name: 'test' });

        const callHeaders = vi.mocked(fetch).mock.calls[0][1].headers;
        expect(callHeaders['Content-Type']).toBe('application/json');
    });
});

describe('buildUrl', () => {
    beforeEach(() => {
        vi.stubGlobal('window', { location: { origin: 'https://example.com' } });
    });

    it('appends query params to base URI', () => {
        const result = buildUrl('/api', { code: 'abc' });
        expect(result).toBe('/api?code=abc');
    });

    it('returns baseUri unchanged when queryParams is null', () => {
        const result = buildUrl('/api', null);
        expect(result).toBe('/api');
    });

    it('returns baseUri unchanged when queryParams is undefined', () => {
        const result = buildUrl('/api', undefined);
        expect(result).toBe('/api');
    });
});
