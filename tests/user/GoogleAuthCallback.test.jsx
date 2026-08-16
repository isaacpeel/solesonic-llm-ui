import {StrictMode} from 'react';
import {render, waitFor} from '@testing-library/react';
import {describe, it, expect, vi, beforeEach} from 'vitest';

const {navigateMock, googleAuthServiceMock, toastMock, logMock} = vi.hoisted(() => ({
    navigateMock: vi.fn(),
    googleAuthServiceMock: {
        authUri: vi.fn(),
        authCallback: vi.fn(),
        profile: vi.fn(),
        revoke: vi.fn(),
    },
    toastMock: Object.assign(vi.fn(), {error: vi.fn()}),
    logMock: {error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()},
}));

vi.mock('react-router', () => ({
    useNavigate: () => navigateMock,
}));

vi.mock('../../src/service/GoogleAuthService.js', () => ({
    default: googleAuthServiceMock,
}));

vi.mock('react-toastify', () => ({
    toast: toastMock,
    ToastContainer: () => null,
    Bounce: {},
}));

vi.mock('loglevel', () => ({
    default: logMock,
}));

const SETTINGS_NAVIGATION = ['/settings', {replace: true, state: {panel: 'googleSettings'}}];

// The component snapshots window.location.search at module load, so each case needs the URL set
// before a fresh import.
const loadCallback = async (search) => {
    window.history.replaceState({}, '', `/google/auth/callback${search}`);
    vi.resetModules();

    const module = await import('../../src/user/GoogleAuthCallback.jsx');

    return module.default;
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('GoogleAuthCallback', () => {
    it('exchanges the authorization code exactly once under StrictMode double-invocation', async () => {
        googleAuthServiceMock.authCallback.mockResolvedValue(null);
        const GoogleAuthCallback = await loadCallback('?code=google-code-1');

        render(<StrictMode><GoogleAuthCallback/></StrictMode>);

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalled();
        });

        expect(googleAuthServiceMock.authCallback).toHaveBeenCalledTimes(1);
        expect(googleAuthServiceMock.authCallback).toHaveBeenCalledWith('google-code-1');
    });

    it('toasts success and returns to the Google settings panel with the code replaced', async () => {
        googleAuthServiceMock.authCallback.mockResolvedValue(null);
        const GoogleAuthCallback = await loadCallback('?code=google-code-2');

        render(<GoogleAuthCallback/>);

        await waitFor(() => {
            expect(toastMock).toHaveBeenCalledWith('Google account connected');
        });

        expect(navigateMock).toHaveBeenCalledWith(...SETTINGS_NAVIGATION);
    });

    it('renders a connecting message while the exchange is in flight', async () => {
        googleAuthServiceMock.authCallback.mockResolvedValue(null);
        const GoogleAuthCallback = await loadCallback('?code=google-code-3');

        const {container} = render(<GoogleAuthCallback/>);

        expect(container.querySelector('.google-auth-callback')).not.toBeNull();
    });

    it('treats a declined consent screen as cancelled and never exchanges', async () => {
        const GoogleAuthCallback = await loadCallback('?error=access_denied');

        render(<GoogleAuthCallback/>);

        await waitFor(() => {
            expect(toastMock.error).toHaveBeenCalledWith('Google connection was cancelled.');
        });

        expect(googleAuthServiceMock.authCallback).not.toHaveBeenCalled();
        expect(navigateMock).toHaveBeenCalledWith(...SETTINGS_NAVIGATION);
    });

    it('returns to settings without a toast when there is no code at all', async () => {
        const GoogleAuthCallback = await loadCallback('');

        render(<GoogleAuthCallback/>);

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith(...SETTINGS_NAVIGATION);
        });

        expect(googleAuthServiceMock.authCallback).not.toHaveBeenCalled();
        expect(toastMock).not.toHaveBeenCalled();
        expect(toastMock.error).not.toHaveBeenCalled();
    });

    it('reports a 400 as a reconnect prompt rather than a generic failure', async () => {
        const rejection = new Error('400: GET - /google/auth/callback reconnect');
        rejection.status = 400;
        googleAuthServiceMock.authCallback.mockRejectedValue(rejection);
        const GoogleAuthCallback = await loadCallback('?code=spent-code');

        render(<GoogleAuthCallback/>);

        await waitFor(() => {
            expect(toastMock.error).toHaveBeenCalledWith(
                'Google declined the connection. Please try connecting again.',
            );
        });

        expect(navigateMock).toHaveBeenCalledWith(...SETTINGS_NAVIGATION);
    });

    it('reports any other failure with a visible generic message', async () => {
        const rejection = new Error('failed to fetch');
        googleAuthServiceMock.authCallback.mockRejectedValue(rejection);
        const GoogleAuthCallback = await loadCallback('?code=api-down');

        render(<GoogleAuthCallback/>);

        await waitFor(() => {
            expect(toastMock.error).toHaveBeenCalledWith(
                'Could not connect your Google account. Please try again.',
            );
        });

        expect(navigateMock).toHaveBeenCalledWith(...SETTINGS_NAVIGATION);
    });
});
