import {StrictMode} from 'react';
import {render, waitFor} from '@testing-library/react';
import {describe, it, expect, vi, beforeEach} from 'vitest';

const {navigateMock, atlassianAuthServiceMock, toastMock, logMock} = vi.hoisted(() => ({
    navigateMock: vi.fn(),
    atlassianAuthServiceMock: {
        authUri: vi.fn(),
        authCallback: vi.fn(),
    },
    toastMock: Object.assign(vi.fn(), {error: vi.fn()}),
    logMock: {error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()},
}));

vi.mock('react-router', () => ({
    useNavigate: () => navigateMock,
}));

vi.mock('../../../src/service/AtlassianAuthService.js', () => ({
    default: atlassianAuthServiceMock,
}));

vi.mock('react-toastify', () => ({
    toast: toastMock,
    ToastContainer: () => null,
    Bounce: {},
}));

vi.mock('loglevel', () => ({
    default: logMock,
}));

const SETTINGS_NAVIGATION = ['/settings', {replace: true, state: {panel: 'atlassianSettings'}}];

// The component snapshots window.location.search at module load, so each case needs the URL set
// before a fresh import.
const loadCallback = async (search) => {
    window.history.replaceState({}, '', `/atlassian/auth/callback${search}`);
    vi.resetModules();

    const module = await import('../../../src/settings/connections/AtlassianAuthCallback.jsx');

    return module.default;
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('AtlassianAuthCallback', () => {
    it('exchanges the authorization code exactly once under StrictMode double-invocation', async () => {
        atlassianAuthServiceMock.authCallback.mockResolvedValue(null);
        const AtlassianAuthCallback = await loadCallback('?code=atlassian-code-1');

        render(<StrictMode><AtlassianAuthCallback/></StrictMode>);

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalled();
        });

        expect(atlassianAuthServiceMock.authCallback).toHaveBeenCalledTimes(1);
        expect(atlassianAuthServiceMock.authCallback).toHaveBeenCalledWith('atlassian-code-1');
    });

    it('toasts success and returns to the Atlassian settings panel with the code replaced', async () => {
        atlassianAuthServiceMock.authCallback.mockResolvedValue(null);
        const AtlassianAuthCallback = await loadCallback('?code=atlassian-code-2');

        render(<AtlassianAuthCallback/>);

        await waitFor(() => {
            expect(toastMock).toHaveBeenCalledWith('Atlassian account connected');
        });

        expect(navigateMock).toHaveBeenCalledWith(...SETTINGS_NAVIGATION);
    });

    it('renders a connecting message while the exchange is in flight', async () => {
        atlassianAuthServiceMock.authCallback.mockResolvedValue(null);
        const AtlassianAuthCallback = await loadCallback('?code=atlassian-code-3');

        const {container} = render(<AtlassianAuthCallback/>);

        expect(container.querySelector('.atlassian-auth-callback')).not.toBeNull();
    });

    it('treats a declined consent screen as cancelled and never exchanges', async () => {
        const AtlassianAuthCallback = await loadCallback('?error=access_denied');

        render(<AtlassianAuthCallback/>);

        await waitFor(() => {
            expect(toastMock.error).toHaveBeenCalledWith('Atlassian connection was cancelled.');
        });

        expect(atlassianAuthServiceMock.authCallback).not.toHaveBeenCalled();
        expect(navigateMock).toHaveBeenCalledWith(...SETTINGS_NAVIGATION);
    });

    it('returns to settings without a toast when there is no code at all', async () => {
        const AtlassianAuthCallback = await loadCallback('');

        render(<AtlassianAuthCallback/>);

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith(...SETTINGS_NAVIGATION);
        });

        expect(atlassianAuthServiceMock.authCallback).not.toHaveBeenCalled();
        expect(toastMock).not.toHaveBeenCalled();
        expect(toastMock.error).not.toHaveBeenCalled();
    });

    it('reports a 400 as a reconnect prompt rather than a generic failure', async () => {
        const rejection = new Error('400: GET - /atlassian/auth/callback reconnect');
        rejection.status = 400;
        atlassianAuthServiceMock.authCallback.mockRejectedValue(rejection);
        const AtlassianAuthCallback = await loadCallback('?code=spent-code');

        render(<AtlassianAuthCallback/>);

        await waitFor(() => {
            expect(toastMock.error).toHaveBeenCalledWith(
                'Atlassian declined the connection. Please try connecting again.',
            );
        });

        expect(navigateMock).toHaveBeenCalledWith(...SETTINGS_NAVIGATION);
    });

    it('reports any other failure with a visible generic message', async () => {
        const rejection = new Error('failed to fetch');
        atlassianAuthServiceMock.authCallback.mockRejectedValue(rejection);
        const AtlassianAuthCallback = await loadCallback('?code=api-down');

        render(<AtlassianAuthCallback/>);

        await waitFor(() => {
            expect(toastMock.error).toHaveBeenCalledWith(
                'Could not connect your Atlassian account. Please try again.',
            );
        });

        expect(navigateMock).toHaveBeenCalledWith(...SETTINGS_NAVIGATION);
    });
});
