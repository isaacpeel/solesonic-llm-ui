import { describe, it, expect, vi } from 'vitest';
import authService from '../src/service/AuthService.js';

// Mock the fetchAuthSession function using Vitest
vi.mock('aws-amplify/auth', () => ({
    fetchAuthSession: vi.fn().mockResolvedValue({
        tokens: { accessToken: 'fake-access-token' },
        userSub: 'fake-user-id',
    }),
}));

describe('authClient', () => {
    it('should retrieve access token', async () => {
        const token = await authService.getAccessToken();
        expect(token).toBe('fake-access-token');
    });

    it('should retrieve user ID', async () => {
        const userId = await authService.getUserId();
        expect(userId).toBe('fake-user-id');
    });
});
