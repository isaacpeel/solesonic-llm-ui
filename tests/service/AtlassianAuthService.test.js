import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('../../src/client/AxiosClient.js', () => ({
    default: {
        get: vi.fn(),
        setAuthHeader: vi.fn(),
        buildUrl: vi.fn(),
    },
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getAccessToken: vi.fn(),
    },
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {
        atlassianUri: 'https://api.example.com/atlassian',
    },
}));

import atlassianAuthService from '../../src/service/AtlassianAuthService.js';
import axiosClient from '../../src/client/AxiosClient.js';
import authService from '../../src/service/AuthService.js';

beforeEach(() => {
    authService.getAccessToken.mockResolvedValue('mock-token');
    axiosClient.setAuthHeader.mockReturnValue({headers: {Authorization: 'Bearer mock-token'}});
    axiosClient.buildUrl.mockImplementation((uri) => uri);
});

afterEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// authUri
// ---------------------------------------------------------------------------

describe('authUri', () => {
    it('calls axiosClient.get with the auth/uri endpoint and auth header', async () => {
        axiosClient.get.mockResolvedValue({uri: 'https://atlassian.example.com/oauth'});

        const result = await atlassianAuthService.authUri();

        expect(axiosClient.setAuthHeader).toHaveBeenCalledWith('mock-token');
        expect(axiosClient.get).toHaveBeenCalledWith(
            'https://api.example.com/atlassian/auth/uri',
            {headers: {Authorization: 'Bearer mock-token'}},
        );
        expect(result).toEqual({uri: 'https://atlassian.example.com/oauth'});
    });
});

// ---------------------------------------------------------------------------
// authCallback
// ---------------------------------------------------------------------------

describe('authCallback', () => {
    it('builds URL with code query param and calls axiosClient.get', async () => {
        axiosClient.buildUrl.mockReturnValue(
            'https://api.example.com/atlassian/auth/callback?code=abc123',
        );
        axiosClient.get.mockResolvedValue({tokens: {accessToken: 'atlassian-token'}});

        const result = await atlassianAuthService.authCallback('abc123');

        expect(axiosClient.buildUrl).toHaveBeenCalledWith(
            'https://api.example.com/atlassian/auth/callback',
            {code: 'abc123'},
        );
        expect(axiosClient.get).toHaveBeenCalledWith(
            'https://api.example.com/atlassian/auth/callback?code=abc123',
            {headers: {Authorization: 'Bearer mock-token'}},
        );
        expect(result).toEqual({tokens: {accessToken: 'atlassian-token'}});
    });

    it('coerces the code to a string in the query params', async () => {
        axiosClient.get.mockResolvedValue({});

        await atlassianAuthService.authCallback(12345);

        expect(axiosClient.buildUrl).toHaveBeenCalledWith(
            expect.any(String),
            {code: '12345'},
        );
    });
});
