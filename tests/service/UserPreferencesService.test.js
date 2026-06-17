import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('../../src/client/ApiClient.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getUserId: vi.fn(),
    },
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {
        usersUri: 'https://api.example.com/users',
    },
}));

import userPreferencesService from '../../src/service/UserPreferencesService.js';
import apiClient from '../../src/client/ApiClient.js';
import authService from '../../src/service/AuthService.js';

beforeEach(() => {
    authService.getUserId.mockResolvedValue('user-42');
});

afterEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe('get', () => {
    it('calls apiClient.get with the user preferences URI and returns the result', async () => {
        apiClient.get.mockResolvedValue({model: 'gpt-4'});

        const result = await userPreferencesService.get();

        expect(apiClient.get).toHaveBeenCalledWith(
            'https://api.example.com/users/user-42/preferences',
        );
        expect(result).toEqual({model: 'gpt-4'});
    });
});

// ---------------------------------------------------------------------------
// save
// ---------------------------------------------------------------------------

describe('save', () => {
    it('calls apiClient.post with the preferences payload and returns the result', async () => {
        const preferences = {model: 'claude-3'};
        apiClient.post.mockResolvedValue(preferences);

        const result = await userPreferencesService.save(preferences);

        expect(apiClient.post).toHaveBeenCalledWith(
            'https://api.example.com/users/user-42/preferences',
            preferences,
        );
        expect(result).toEqual(preferences);
    });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('update', () => {
    it('calls apiClient.put with the preferences payload and returns the result', async () => {
        const preferences = {model: 'claude-3', theme: 'dark'};
        apiClient.put.mockResolvedValue(preferences);

        const result = await userPreferencesService.update(preferences);

        expect(apiClient.put).toHaveBeenCalledWith(
            'https://api.example.com/users/user-42/preferences',
            preferences,
        );
        expect(result).toEqual(preferences);
    });
});
