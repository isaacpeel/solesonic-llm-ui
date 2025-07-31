import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import UserSettings from '../../src/user/UserSettings.jsx';
import { describe, it, vi, expect } from 'vitest';
import AtlassianAuthService from "../../src/service/AtlassianAuthService.js";

vi.mock('../../src/service/AtlassianAuthService.js', () => ({
    default: {
        authCallback: vi.fn((code) => {
            if (code === '12345') {
                return Promise.resolve({ tokens: { accessToken: 'mock-token' } });
            }
            return Promise.reject(new Error('Invalid code'));
        }),
    },
}));

vi.mock('../../src/service/OllamaService.js', () => ({
    default: {
        models: vi.fn().mockResolvedValue([
            { name: 'model1', model: 'model1', size: 123456 },
            { name: 'Model2', model: 'model2', size: 789012 },
        ]),
    },
}));

vi.mock('../../src/service/UserPreferencesService.js', () => ({
    default: {
        get: vi.fn().mockResolvedValue({model: 'model1'}),
    },
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getAccessToken: vi.fn().mockResolvedValue({ tokens: {accessToken: 'fake-access-token'} }),
    }
}))



describe('UserSettings', () => {
    it('calls authCallback only once when the page is refreshed', async () => {
        const initialRoute = '/settings/?code=12345';

        const { rerender } = render(
            <MemoryRouter initialEntries={[initialRoute]}>
                <Routes>
                    <Route path="/settings" element={<UserSettings />} />
                </Routes>
            </MemoryRouter>
        );

        const mockAuthCallback = AtlassianAuthService.authCallback;

        await waitFor(() => expect(mockAuthCallback).toHaveBeenCalledTimes(1));

        expect(mockAuthCallback).toHaveBeenCalledWith('12345');

        rerender(
            <MemoryRouter initialEntries={[initialRoute]}>
                <Routes>
                    <Route path="/settings" element={<UserSettings/>} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => expect(mockAuthCallback).toHaveBeenCalledTimes(1));
    });
});
