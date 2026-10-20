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

vi.mock('../../src/service/PushSubscriptionService.js', () => ({
    default: {releaseOnLogout: vi.fn()},
}));

let lastKeycloakInstance;
let mockInit;
let mockTokenParsed;
let mockUserInfo;

vi.mock('keycloak-js', () => ({
    default: vi.fn().mockImplementation(function KeycloakMock() {
        lastKeycloakInstance = {
            init: (...args) => mockInit(...args),
            updateToken: vi.fn(),
            login: vi.fn(),
            logout: vi.fn(),
            loadUserInfo: vi.fn().mockResolvedValue(mockUserInfo ?? {}),
            token: 'fake-token',
            tokenParsed: mockTokenParsed,
        };

        return lastKeycloakInstance;
    }),
}));

vi.mock('../../src/util/pageLifecycle.js', () => ({
    observePageResumed: vi.fn().mockReturnValue(() => {}),
}));

import {observePageResumed} from '../../src/util/pageLifecycle.js';
import pushSubscriptionService from '../../src/service/PushSubscriptionService.js';

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

const GroupConsumer = ({groupName}) => {
    const {authenticated, hasGroup} = useKeycloak();

    return (
        <div>
            <span data-testid="authenticated">{String(authenticated)}</span>
            <span data-testid="has-group">{String(hasGroup(groupName))}</span>
        </div>
    );
};

const renderGroupConsumer = async (groupName) => {
    render(
        <KeycloakProvider>
            <GroupConsumer groupName={groupName}/>
        </KeycloakProvider>
    );

    await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });

    return screen.getByTestId('has-group').textContent;
};

describe('KeycloakProvider hasGroup', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        observePageResumed.mockImplementation(() => () => {});
        mockInit = vi.fn().mockResolvedValue(true);
        mockTokenParsed = undefined;
        mockUserInfo = undefined;
    });

    test('is true when the access token groups claim names the group', async () => {
        mockTokenParsed = {sub: 'user-1', groups: ['izzy-bot-admin']};

        expect(await renderGroupConsumer('izzy-bot-admin')).toBe('true');
    });

    test('is false when the access token carries no groups claim', async () => {
        mockTokenParsed = {sub: 'user-1'};

        expect(await renderGroupConsumer('izzy-bot-admin')).toBe('false');
    });

    test('is false when only a role of the same name is present', async () => {
        mockTokenParsed = {sub: 'user-1', realm_access: {roles: ['izzy-bot-admin']}};
        mockUserInfo = {roles: ['izzy-bot-admin']};

        expect(await renderGroupConsumer('izzy-bot-admin')).toBe('false');
    });

    test('does not match a full group path, as the API compares the bare name', async () => {
        mockTokenParsed = {sub: 'user-1', groups: ['/izzy-bot-admin']};

        expect(await renderGroupConsumer('izzy-bot-admin')).toBe('false');
    });
});

const LogoutConsumer = () => {
    const {authenticated, logout} = useKeycloak();

    return (
        <div>
            <span data-testid="authenticated">{String(authenticated)}</span>
            <button onClick={logout}>logout</button>
        </div>
    );
};

const renderAndLogOut = async () => {
    render(
        <KeycloakProvider>
            <LogoutConsumer/>
        </KeycloakProvider>
    );

    await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });

    await act(async () => {
        screen.getByText('logout').click();
    });
};

describe('KeycloakProvider logout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        observePageResumed.mockImplementation(() => () => {});
        mockInit = vi.fn().mockResolvedValue(true);
        mockTokenParsed = undefined;
        mockUserInfo = undefined;
    });

    test('releases this device before signing out', async () => {
        pushSubscriptionService.releaseOnLogout.mockResolvedValue(undefined);

        await renderAndLogOut();

        await waitFor(() => {
            expect(lastKeycloakInstance.logout).toHaveBeenCalledWith({redirectUri: window.location.origin});
        });
        expect(pushSubscriptionService.releaseOnLogout.mock.invocationCallOrder[0])
            .toBeLessThan(lastKeycloakInstance.logout.mock.invocationCallOrder[0]);
    });

    test('waits for the release to settle before signing out', async () => {
        let finishRelease;
        pushSubscriptionService.releaseOnLogout.mockReturnValue(new Promise((resolve) => {
            finishRelease = resolve;
        }));

        await renderAndLogOut();

        expect(lastKeycloakInstance.logout).not.toHaveBeenCalled();

        await act(async () => {
            finishRelease();
        });

        expect(lastKeycloakInstance.logout).toHaveBeenCalledTimes(1);
    });

    test('still signs out when the release rejects', async () => {
        pushSubscriptionService.releaseOnLogout.mockRejectedValue(new Error('network down'));

        await renderAndLogOut();

        await waitFor(() => {
            expect(lastKeycloakInstance.logout).toHaveBeenCalledTimes(1);
        });
    });
});
