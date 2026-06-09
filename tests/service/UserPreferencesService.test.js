import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('../../src/client/AxiosClient.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        setAuthHeader: vi.fn(),
    },
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getAccessToken: vi.fn(),
        getUserId: vi.fn(),
    },
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {
        usersUri: 'https://api.example.com/users',
    },
}));

import userPreferencesService from '../../src/service/UserPreferencesService.js';
import axiosClient from '../../src/client/AxiosClient.js';
import authService from '../../src/service/AuthService.js';

beforeEach(() => {
    authService.getAccessToken.mockResolvedValue('mock-token');
    authService.getUserId.mockResolvedValue('user-42');
    axiosClient.setAuthHeader.mockReturnValue({headers: {Authorization: 'Bearer mock-token'}});
});

afterEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe('get', () => {
    it('calls axiosClient.get with the user preferences URI and returns the result', async () => {
        axiosClient.get.mockResolvedValue({model: 'gpt-4'});

        const result = await userPreferencesService.get();

        expect(axiosClient.setAuthHeader).toHaveBeenCalledWith('mock-token');
        expect(axiosClient.get).toHaveBeenCalledWith(
            'https://api.example.com/users/user-42/preferences',
            {headers: {Authorization: 'Bearer mock-token'}},
        );
        expect(result).toEqual({model: 'gpt-4'});
    });
});

// ---------------------------------------------------------------------------
// save
// ---------------------------------------------------------------------------

describe('save', () => {
    it('calls axiosClient.post with the preferences payload and returns the result', async () => {
        const preferences = {model: 'claude-3'};
        axiosClient.post.mockResolvedValue(preferences);

        const result = await userPreferencesService.save(preferences);

        expect(axiosClient.post).toHaveBeenCalledWith(
            'https://api.example.com/users/user-42/preferences',
            preferences,
            {headers: {Authorization: 'Bearer mock-token'}},
        );
        expect(result).toEqual(preferences);
    });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('update', () => {
    it('calls axiosClient.put with the preferences payload and returns the result', async () => {
        const preferences = {model: 'claude-3', theme: 'dark'};
        axiosClient.put.mockResolvedValue(preferences);

        const result = await userPreferencesService.update(preferences);

        expect(axiosClient.put).toHaveBeenCalledWith(
            'https://api.example.com/users/user-42/preferences',
            preferences,
            {headers: {Authorization: 'Bearer mock-token'}},
        );
        expect(result).toEqual(preferences);
    });
});
