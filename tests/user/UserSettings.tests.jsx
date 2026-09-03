import {render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter, Navigate, Route, Routes} from 'react-router';
import {describe, it, vi, expect, beforeEach, afterEach} from 'vitest';

import UserSettings from '../../src/user/UserSettings.jsx';
import GeneralUserSettings from '../../src/user/GeneralUserSettings.jsx';
import ConnectionsSettings from '../../src/user/ConnectionsSettings.jsx';
import {useKeycloak} from '../../src/providers/KeycloakProvider.jsx';

vi.mock('../../src/providers/KeycloakProvider.jsx', () => ({
    useKeycloak: vi.fn(),
}));

vi.mock('../../src/service/AtlassianAuthService.js', () => ({
    default: {
        authUri: vi.fn().mockResolvedValue({uri: 'https://atlassian.example.com/oauth'}),
    },
}));

vi.mock('../../src/service/GoogleAuthService.js', () => ({
    default: {
        authUri: vi.fn().mockResolvedValue({uri: 'https://accounts.google.com/oauth'}),
        profile: vi.fn().mockResolvedValue({}),
        revoke: vi.fn().mockResolvedValue({}),
    },
}));

vi.mock('../../src/service/UserPreferencesService.js', () => ({
    default: {
        get: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        patch: vi.fn().mockResolvedValue({}),
    },
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getAccessToken: vi.fn().mockResolvedValue({tokens: {accessToken: 'fake-access-token'}}),
    },
}));

function keycloakMock({roles}) {
    return {
        keycloak: {},
        authenticated: true,
        loading: false,
        user: {
            name: 'Ada Lovelace',
            given_name: 'Ada',
            family_name: 'Lovelace',
            preferred_username: 'ada',
            email: 'ada@example.com',
            roles,
        },
        hasRole: (role) => roles.includes(role),
        login: vi.fn(),
        logout: vi.fn(),
        getToken: vi.fn(),
    };
}

function renderSettings(initialRoute = '/settings') {
    return render(
        <MemoryRouter initialEntries={[initialRoute]}>
            <Routes>
                <Route path="/settings" element={<UserSettings/>}>
                    <Route index element={<Navigate to="general" replace/>}/>
                    <Route path="general" element={<GeneralUserSettings/>}/>
                    <Route path="connections" element={<ConnectionsSettings/>}/>
                </Route>
            </Routes>
        </MemoryRouter>
    );
}

const activeNavLabel = () => document.querySelector('.settings-nav-row.selected')?.textContent?.trim();

const navLabels = () => Array.from(document.querySelectorAll('.settings-nav-row'))
    .map((navRow) => navRow.textContent.trim());

describe('UserSettings navigation', () => {
    beforeEach(() => {
        useKeycloak.mockReturnValue(keycloakMock({roles: ['rag-admin']}));
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('redirects the bare settings route to General', () => {
        renderSettings('/settings');

        expect(activeNavLabel()).toBe('General');
    });

    it('marks the active entry with aria-current', async () => {
        renderSettings('/settings/connections');

        await waitFor(() => {
            const current = document.querySelector('.settings-nav-row[aria-current="page"]');
            expect(current.textContent.trim()).toBe('Connections');
        });
    });

    it('offers one merged Connections entry rather than per-provider entries', () => {
        renderSettings('/settings/general');

        expect(navLabels()).toEqual(['General', 'Connections', 'RAG']);
    });

    it('renders a back link to the chat', () => {
        renderSettings('/settings/general');

        const backLink = document.querySelector('.settings-back-link');
        expect(backLink.getAttribute('href')).toBe('/');
    });

    it('is not rendered as a fixed overlay', () => {
        const {container} = renderSettings('/settings/general');

        expect(container.querySelector('.settings-container')).toBeNull();
        expect(container.querySelector('.settings-page')).not.toBeNull();
    });
});

describe('UserSettings deep links', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('opens the panel named in the URL for an admin', async () => {
        useKeycloak.mockReturnValue(keycloakMock({roles: ['rag-admin']}));

        renderSettings('/settings/connections');

        await waitFor(() => {
            expect(activeNavLabel()).toBe('Connections');
            expect(screen.getByRole('heading', {name: 'Connections'})).toBeDefined();
        });
    });

    it('opens the panel named in the URL for a non-admin', async () => {
        useKeycloak.mockReturnValue(keycloakMock({roles: []}));

        renderSettings('/settings/connections');

        await waitFor(() => expect(activeNavLabel()).toBe('Connections'));
    });

    it('shows RAG in the nav to a non-admin', () => {
        useKeycloak.mockReturnValue(keycloakMock({roles: []}));

        renderSettings('/settings/general');

        expect(navLabels()).toContain('RAG');
    });
});

describe('General profile panel', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('renders identity-provider fields read-only', () => {
        useKeycloak.mockReturnValue(keycloakMock({roles: ['rag-admin', 'model-admin']}));

        renderSettings('/settings/general');

        expect(screen.getByText('ada@example.com')).toBeDefined();
        expect(screen.getByText('Ada')).toBeDefined();
        expect(screen.getByText('Lovelace')).toBeDefined();
        expect(document.querySelectorAll('input').length).toBe(0);
    });

    it('renders one chip per assigned role', () => {
        useKeycloak.mockReturnValue(keycloakMock({roles: ['rag-admin', 'model-admin']}));

        renderSettings('/settings/general');

        const chips = Array.from(document.querySelectorAll('.general-settings-role-chip'))
            .map((chip) => chip.textContent);

        expect(chips).toEqual(['rag-admin', 'model-admin']);
    });

    it('omits the Location row when the identity provider supplies no claim', () => {
        useKeycloak.mockReturnValue(keycloakMock({roles: []}));

        renderSettings('/settings/general');

        expect(screen.queryByText('Location')).toBeNull();
    });
});
