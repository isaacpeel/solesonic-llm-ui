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
        googleUri: 'https://api.example.com/google',
    },
}));

import googleAuthService from '../../src/service/GoogleAuthService.js';
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
        apiClient.get.mockResolvedValue({uri: 'https://accounts.google.com/o/oauth2/v2/auth'});

        const result = await googleAuthService.authUri();

        expect(apiClient.get).toHaveBeenCalledWith(
            'https://api.example.com/google/auth/uri',
        );
        expect(result).toEqual({uri: 'https://accounts.google.com/o/oauth2/v2/auth'});
    });
});

// ---------------------------------------------------------------------------
// authCallback
// ---------------------------------------------------------------------------

describe('authCallback', () => {
    it('builds URL with code query param and calls apiClient.get', async () => {
        apiClient.get.mockResolvedValue(null);

        const result = await googleAuthService.authCallback('abc123');

        expect(buildUrl).toHaveBeenCalledWith(
            'https://api.example.com/google/auth/callback',
            {code: 'abc123'},
        );
        expect(apiClient.get).toHaveBeenCalledWith(
            'https://api.example.com/google/auth/callback?code=abc123',
        );
        expect(result).toBeNull();
    });

    it('coerces the code to a string in the query params', async () => {
        apiClient.get.mockResolvedValue(null);

        await googleAuthService.authCallback(12345);

        expect(buildUrl).toHaveBeenCalledWith(
            expect.any(String),
            {code: '12345'},
        );
    });
});

// ---------------------------------------------------------------------------
// profile
// ---------------------------------------------------------------------------

describe('profile', () => {
    it('calls apiClient.get with the auth/profile endpoint and returns the Gmail profile', async () => {
        const gmailProfile = {
            emailAddress: 'someone@example.com',
            messagesTotal: 12043,
            threadsTotal: 8871,
            historyId: '992144',
        };
        apiClient.get.mockResolvedValue(gmailProfile);

        const result = await googleAuthService.profile();

        expect(apiClient.get).toHaveBeenCalledWith(
            'https://api.example.com/google/auth/profile',
        );
        expect(result).toEqual(gmailProfile);
    });
});

// ---------------------------------------------------------------------------
// revoke
// ---------------------------------------------------------------------------

describe('revoke', () => {
    it('calls apiClient.post with the auth/revoke endpoint', async () => {
        apiClient.post.mockResolvedValue(null);

        const result = await googleAuthService.revoke();

        expect(apiClient.post).toHaveBeenCalledWith(
            'https://api.example.com/google/auth/revoke',
        );
        expect(result).toBeNull();
    });
});
