import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('../../src/client/ApiClient.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
    buildUrl: vi.fn(),
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {
        atlassianUri: 'https://api.example.com/atlassian',
    },
}));

import atlassianAuthService from '../../src/service/AtlassianAuthService.js';
import apiClient, { buildUrl } from '../../src/client/ApiClient.js';

beforeEach(() => {
    buildUrl.mockImplementation((uri, params) => {
        if (!params) {
            return uri;
        }
        const queryString = Object.entries(params)
            .map(([key, value]) => `${key}=${value}`)
            .join('&');
        return `${uri}?${queryString}`;
    });
});

afterEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// authUri
// ---------------------------------------------------------------------------

describe('authUri', () => {
    it('calls apiClient.get with the auth/uri endpoint and returns the result', async () => {
        apiClient.get.mockResolvedValue({uri: 'https://atlassian.example.com/oauth'});

        const result = await atlassianAuthService.authUri();

        expect(apiClient.get).toHaveBeenCalledWith(
            'https://api.example.com/atlassian/auth/uri',
        );
        expect(result).toEqual({uri: 'https://atlassian.example.com/oauth'});
    });
});

// ---------------------------------------------------------------------------
// authCallback
// ---------------------------------------------------------------------------

describe('authCallback', () => {
    it('builds URL with code query param and calls apiClient.get', async () => {
        apiClient.get.mockResolvedValue({tokens: {accessToken: 'atlassian-token'}});

        const result = await atlassianAuthService.authCallback('abc123');

        expect(buildUrl).toHaveBeenCalledWith(
            'https://api.example.com/atlassian/auth/callback',
            {code: 'abc123'},
        );
        expect(apiClient.get).toHaveBeenCalledWith(
            'https://api.example.com/atlassian/auth/callback?code=abc123',
        );
        expect(result).toEqual({tokens: {accessToken: 'atlassian-token'}});
    });

    it('coerces the code to a string in the query params', async () => {
        apiClient.get.mockResolvedValue({});

        await atlassianAuthService.authCallback(12345);

        expect(buildUrl).toHaveBeenCalledWith(
            expect.any(String),
            {code: '12345'},
        );
    });
});
