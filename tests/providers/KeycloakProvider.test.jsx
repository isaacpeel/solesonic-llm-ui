import {render, screen, waitFor, act} from '@testing-library/react';
import {describe, test, expect, vi, beforeEach} from 'vitest';
import {KeycloakProvider, useKeycloak} from '../../src/providers/KeycloakProvider.jsx';
import authService from '../../src/service/AuthService.js';
import {toast} from 'react-toastify';

vi.mock('../../src/config/keycloak.js', () => ({
    default: {url: 'https://kc.example.com', realm: 'test-realm', clientId: 'test-client'},
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {authFailure: vi.fn()},
}));

vi.mock('react-toastify', () => ({
    toast: {error: vi.fn()},
}));

let lastKeycloakInstance;
let mockInit;

vi.mock('keycloak-js', () => ({
    default: vi.fn().mockImplementation(function KeycloakMock() {
        lastKeycloakInstance = {
            init: (...args) => mockInit(...args),
            updateToken: vi.fn(),
            login: vi.fn(),
            logout: vi.fn(),
            loadUserInfo: vi.fn().mockResolvedValue({}),
            token: 'fake-token',
        };

        return lastKeycloakInstance;
    }),
}));

vi.mock('../../src/util/pageLifecycle.js', () => ({
    observePageResumed: vi.fn().mockReturnValue(() => {}),
}));

import {observePageResumed} from '../../src/util/pageLifecycle.js';

const Consumer = () => {
    const {authenticated, loading, keycloak, login} = useKeycloak();

    return (
        <div>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="authenticated">{String(authenticated)}</span>
            <span data-testid="has-keycloak">{String(!!keycloak)}</span>
            <button onClick={login}>login</button>
        </div>
    );
};

describe('KeycloakProvider', () => {
    beforeEach(() => {
        lastKeycloakInstance = undefined;
        mockInit = undefined;
        vi.clearAllMocks();
        observePageResumed.mockImplementation(() => () => {});
    });

    test('wires onAuthError to feed authService.authFailure', () => {
        mockInit = vi.fn().mockReturnValue(new Promise(() => {}));

        render(
            <KeycloakProvider>
                <Consumer/>
            </KeycloakProvider>
        );

        const errorData = {error: 'access_denied', error_description: 'denied'};
        lastKeycloakInstance.onAuthError(errorData);

        expect(authService.authFailure).toHaveBeenCalledWith('access_denied');
    });

    test('keeps keycloak usable (login callable) after init() rejects', async () => {
        mockInit = vi.fn().mockRejectedValue(new Error('CSP blocked the token exchange'));

        render(
            <KeycloakProvider>
                <Consumer/>
            </KeycloakProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });

        expect(screen.getByTestId('authenticated').textContent).toBe('false');
        expect(screen.getByTestId('has-keycloak').textContent).toBe('true');

        screen.getByText('login').click();

        expect(lastKeycloakInstance.login).toHaveBeenCalled();
    });

    test('does not force a logout when a refresh attempt fails - keycloak-js redirects on its own if the session is truly dead', async () => {
        mockInit = vi.fn().mockResolvedValue(true);

        render(
            <KeycloakProvider>
                <Consumer/>
            </KeycloakProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('authenticated').textContent).toBe('true');
        });

        lastKeycloakInstance.updateToken.mockRejectedValue(new Error('network blip'));

        vi.useFakeTimers();

        try {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(60000);
            });
        } finally {
            vi.useRealTimers();
        }

        expect(screen.getByTestId('authenticated').textContent).toBe('true');
        expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('Session expired'));
    });

    test('refreshes the token as soon as the page resumes from background', async () => {
        mockInit = vi.fn().mockResolvedValue(true);

        let notifyPageResumed = null;
        observePageResumed.mockImplementation((callback) => {
            notifyPageResumed = callback;

            return () => {};
        });

        render(
            <KeycloakProvider>
                <Consumer/>
            </KeycloakProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('authenticated').textContent).toBe('true');
        });

        await waitFor(() => {
            expect(notifyPageResumed).toBeInstanceOf(Function);
        });

        lastKeycloakInstance.updateToken.mockClear();
        lastKeycloakInstance.updateToken.mockResolvedValue(true);

        await act(async () => {
            notifyPageResumed();
        });

        expect(lastKeycloakInstance.updateToken).toHaveBeenCalledWith(30);
    });

    test('shows a session-expired toast once keycloak-js has already cleared the token (refresh token genuinely dead)', () => {
        mockInit = vi.fn().mockReturnValue(new Promise(() => {}));

        render(
            <KeycloakProvider>
                <Consumer/>
            </KeycloakProvider>
        );

        // keycloak-js only reaches this state - token cleared - after it decided the refresh
        // token was truly rejected (400/invalid_grant), and it has already redirected to
        // login itself via clearToken() at that point; this handler only owns the toast.
        lastKeycloakInstance.token = undefined;
        lastKeycloakInstance.onAuthRefreshError();

        expect(toast.error).toHaveBeenCalledWith('Your session expired. Please sign in again.');
    });

    test('does not toast or redirect for a transient refresh failure that leaves the token intact', () => {
        mockInit = vi.fn().mockReturnValue(new Promise(() => {}));

        render(
            <KeycloakProvider>
                <Consumer/>
            </KeycloakProvider>
        );

        // token stays at its mock default ('fake-token') - keycloak-js only clears it on a
        // genuine invalid_grant, so a network blip during any API call must not force a
        // real login redirect (this was firing unconditionally before the fix).
        lastKeycloakInstance.onAuthRefreshError();

        expect(toast.error).not.toHaveBeenCalled();
        expect(lastKeycloakInstance.login).not.toHaveBeenCalled();
    });
});
