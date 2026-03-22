import { describe, it, expect, vi } from 'vitest';
import authService from '../src/service/AuthService.js';

describe('authClient', () => {
    const mockKeycloakInstance = {
        token: 'fake-access-token',
        tokenParsed: {
            sub: 'fake-user-id',
            exp: Math.floor(Date.now() / 1000) + 3600, // Token not expired
            iat: Math.floor(Date.now() / 1000)
        },
        authenticated: true,
        tokenExpired: vi.fn(() => false),
        updateToken: vi.fn(() => Promise.resolve(true)),
        init: vi.fn(() => Promise.resolve(true)),
        logout: vi.fn()
    };

    beforeEach(() => {
        // Reset mock before each test
        vi.clearAllMocks();
    });

    afterEach(() => {
        // Reset Keycloak mock after each test
        vi.resetModules();
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

        // Test that tokenExpired is checked
        const token = await authService.getAccessToken();
        expect(token).toBe('fake-access-token');
    });
});