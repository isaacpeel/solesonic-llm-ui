import { expect, fn } from 'storybook/test';
import AuthenticationWrapper from './AuthenticationWrapper.jsx';
import { KeycloakContext } from '../providers/KeycloakProvider.jsx';

const AUTH_BLOCKED_UNTIL_KEY = 'authBlockedUntil';

/*
 * The app-shell gate: shows a loading state while Keycloak initializes, a lockout screen when
 * AuthService has recorded too many recent failures, a retry screen if init resolved
 * unauthenticated, or the real children once authenticated. Each story overrides the shared
 * preview's stub KeycloakContext for its state.
 */
const meta = {
    component: AuthenticationWrapper,
    tags: ['ai-generated'],
};

export default meta;

function withKeycloak(value) {
    return (Story) => (
        <KeycloakContext.Provider value={value}>
            <Story />
        </KeycloakContext.Provider>
    );
}

export const Initializing = {
    async beforeEach() {
        localStorage.removeItem(AUTH_BLOCKED_UNTIL_KEY);
    },
    decorators: [withKeycloak({ keycloak: null, authenticated: false, loading: true, login: fn() })],
    args: { children: <div>App content</div> },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('Initializing authentication...')).toBeVisible();
    },
};

export const AuthenticationRequired = {
    async beforeEach() {
        localStorage.removeItem(AUTH_BLOCKED_UNTIL_KEY);
    },
    args: { children: <div>App content</div>, login: fn() },
    decorators: [
        (Story, { args }) => (
            <KeycloakContext.Provider value={{ keycloak: {}, authenticated: false, loading: false, login: args.login }}>
                <Story />
            </KeycloakContext.Provider>
        ),
    ],
    play: async ({ canvas, userEvent, args }) => {
        await userEvent.click(canvas.getByRole('button', { name: 'Try signing in again' }));
        await expect(args.login).toHaveBeenCalledTimes(1);
    },
};

export const Authenticated = {
    async beforeEach() {
        localStorage.removeItem(AUTH_BLOCKED_UNTIL_KEY);
    },
    decorators: [withKeycloak({ keycloak: {}, authenticated: true, loading: false, login: fn() })],
    args: { children: <div>Chat screen would render here</div> },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('Chat screen would render here')).toBeVisible();
    },
};

export const Blocked = {
    async beforeEach() {
        localStorage.setItem(AUTH_BLOCKED_UNTIL_KEY, String(Date.now() + 120000));
    },
    decorators: [withKeycloak({ keycloak: {}, authenticated: false, loading: false, login: fn() })],
    args: { children: <div>App content</div> },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('Account Locked')).toBeVisible();
    },
};
