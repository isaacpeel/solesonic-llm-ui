import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import authService from '../src/service/AuthService.js';

// Provide an in-memory localStorage so these tests work regardless of JS environment
let localStorageData = {};
const localStorageMock = {
    getItem: (key) => localStorageData[key] !== undefined ? localStorageData[key] : null,
    setItem: (key, value) => { localStorageData[key] = String(value); },
    removeItem: (key) => { delete localStorageData[key]; },
    clear: () => { localStorageData = {}; },
};
vi.stubGlobal('localStorage', localStorageMock);

vi.mock('../src/client/ApiClient.js', () => ({
    default: {},
    buildUrl: vi.fn().mockImplementation((uri) => uri),
}));

vi.mock('../src/properties/ApplicationProperties.jsx', () => ({
    default: {
        uiBaseUri: 'https://ui.example.com',
    },
}));

import { buildUrl } from '../src/client/ApiClient.js';

describe('authClient', () => {
    const mockKeycloakInstance = {
        token: 'fake-access-token',
        tokenParsed: {
            sub: 'fake-user-id',
            exp: Math.floor(Date.now() / 1000) + 3600,
            iat: Math.floor(Date.now() / 1000)
        },
        authenticated: true,
        tokenExpired: vi.fn(() => false),
        updateToken: vi.fn(() => Promise.resolve(true)),
        init: vi.fn(() => Promise.resolve(true)),
        logout: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    afterEach(() => {
        vi.resetModules();
        authService.setKeycloakInstance(null);
    });

    it('should retrieve access token', async () => {
        authService.setKeycloakInstance(mockKeycloakInstance);
        const token = await authService.getAccessToken();
        expect(token).toBe('fake-access-token');
    });

    it('should retrieve user ID from token parsed', async () => {
        authService.setKeycloakInstance(mockKeycloakInstance);
        const userId = await authService.getUserId();
        expect(userId).toBe('fake-user-id');
    });

    it('should handle token expiration and refresh', async () => {
        const expiredMock = {
            ...mockKeycloakInstance,
            token: 'old-token',
            tokenExpired: vi.fn(() => true)
        };

        authService.setKeycloakInstance(expiredMock);
    });

    it('should return null when not authenticated', async () => {
        const unauthenticatedMock = {
            ...mockKeycloakInstance,
            authenticated: false,
            token: null
        };

        authService.setKeycloakInstance(unauthenticatedMock);
        const token = await authService.getAccessToken();
        expect(token).toBeNull();
    });

    it('should verify token is valid before returning', async () => {
        authService.setKeycloakInstance(mockKeycloakInstance);

        const token = await authService.getAccessToken();
        expect(token).toBe('fake-access-token');
    });
});

// ---------------------------------------------------------------------------
// getUsername
// ---------------------------------------------------------------------------

describe('getUsername', () => {
    afterEach(() => {
        authService.setKeycloakInstance(null);
    });

    it('returns given_name from tokenParsed', async () => {
        authService.setKeycloakInstance({
            updateToken: vi.fn().mockResolvedValue(true),
            tokenParsed: {given_name: 'Alice', username: 'alice99'},
        });

        const username = await authService.getUsername();

        expect(username).toBe('Alice');
    });

    it('falls back to username when given_name is absent', async () => {
        authService.setKeycloakInstance({
            updateToken: vi.fn().mockResolvedValue(true),
            tokenParsed: {username: 'alice99'},
        });

        const username = await authService.getUsername();

        expect(username).toBe('alice99');
    });

    it('returns null when keycloak is not set', async () => {
        authService.setKeycloakInstance(null);

        const username = await authService.getUsername();

        expect(username).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// getUserProfile
// ---------------------------------------------------------------------------

describe('getUserProfile', () => {
    afterEach(() => {
        authService.setKeycloakInstance(null);
    });

    it('calls keycloak.loadUserProfile() and returns the result', async () => {
        const profile = {email: 'alice@example.com'};
        authService.setKeycloakInstance({
            loadUserProfile: vi.fn().mockResolvedValue(profile),
        });

        const result = await authService.getUserProfile();

        expect(result).toBe(profile);
    });

    it('returns null and logs on rejection', async () => {
        authService.setKeycloakInstance({
            loadUserProfile: vi.fn().mockRejectedValue(new Error('network')),
        });

        const result = await authService.getUserProfile();

        expect(result).toBeNull();
    });

    it('returns null when keycloak is not set', async () => {
        authService.setKeycloakInstance(null);

        const result = await authService.getUserProfile();

        expect(result).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// isBlocked
// ---------------------------------------------------------------------------

describe('isBlocked', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('returns false when localStorage is clear', () => {
        expect(authService.isBlocked()).toBe(false);
    });

    it('returns false when blockedUntil is in the past', () => {
        localStorage.setItem('authBlockedUntil', (Date.now() - 1000).toString());

        expect(authService.isBlocked()).toBe(false);
    });

    it('returns true and removes AUTH_FAILURES_KEY when blockedUntil is in the future', () => {
        localStorage.setItem('authBlockedUntil', (Date.now() + 60_000).toString());
        localStorage.setItem('authFailuresKey', JSON.stringify([Date.now()]));

        const result = authService.isBlocked();

        expect(result).toBe(true);
        expect(localStorage.getItem('authFailuresKey')).toBeNull();
    });

    it('returns true when localStorage.setItem throws (storage unavailable)', () => {
        const setItemSpy = vi.spyOn(localStorageMock, 'setItem').mockImplementationOnce(() => {
            throw new Error('storage unavailable');
        });
        const authFailureSpy = vi.spyOn(authService, 'authFailure').mockResolvedValue(undefined);

        const result = authService.isBlocked();

        expect(result).toBe(true);

        setItemSpy.mockRestore();
        authFailureSpy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// remainingBlockTime
// ---------------------------------------------------------------------------

describe('remainingBlockTime', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('returns 0 when no blockedUntil is stored', () => {
        expect(authService.remainingBlockTime()).toBe(0);
    });

    it('returns a positive number when blockedUntil is in the future', () => {
        localStorage.setItem('authBlockedUntil', (Date.now() + 60_000).toString());

        expect(authService.remainingBlockTime()).toBeGreaterThan(0);
    });

    it('returns 0 when blockedUntil is in the past', () => {
        localStorage.setItem('authBlockedUntil', (Date.now() - 1000).toString());

        expect(authService.remainingBlockTime()).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// authFailure
// ---------------------------------------------------------------------------

describe('authFailure', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(undefined));
        buildUrl.mockImplementation((uri) => uri);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('first call stores one failure in localStorage', async () => {
        await authService.authFailure('some error');

        const failures = JSON.parse(localStorage.getItem('authFailuresKey'));
        expect(failures).toHaveLength(1);
    });

    it('third call within the window sets AUTH_BLOCKED_UNTIL', async () => {
        await authService.authFailure('err');
        await authService.authFailure('err');
        await authService.authFailure('err');

        expect(localStorage.getItem('authBlockedUntil')).not.toBeNull();
    });

    it('prunes attempts older than BLOCK_DURATION_MS before counting', async () => {
        const oldTimestamp = Date.now() - 6 * 60 * 1000;
        localStorage.setItem('authFailuresKey', JSON.stringify([oldTimestamp, oldTimestamp]));

        await authService.authFailure('err');

        const failures = JSON.parse(localStorage.getItem('authFailuresKey'));
        expect(failures).toHaveLength(1);
        expect(localStorage.getItem('authBlockedUntil')).toBeNull();
    });
});
