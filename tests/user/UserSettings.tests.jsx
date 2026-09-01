import {render, fireEvent} from '@testing-library/react';
import {MemoryRouter, Routes, Route} from 'react-router';
import UserSettings from '../../src/user/UserSettings.jsx';
import {describe, it, vi, expect, beforeEach, afterEach} from 'vitest';
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
    },
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getAccessToken: vi.fn().mockResolvedValue({tokens: {accessToken: 'fake-access-token'}}),
    }
}));

function makeRagAdminKeycloakMock() {
    return {
        keycloak: {},
        authenticated: true,
        loading: false,
        user: {name: 'Admin User', roles: ['rag-admin']},
        hasRole: (role) => role === 'rag-admin',
        roles: ['rag-admin'],
        login: vi.fn(),
        logout: vi.fn(),
        getToken: vi.fn(),
    };
}

function makeRegularUserKeycloakMock() {
    return {
        keycloak: {},
        authenticated: true,
        loading: false,
        user: {name: 'Regular User', roles: []},
        hasRole: () => false,
        roles: [],
        login: vi.fn(),
        logout: vi.fn(),
        getToken: vi.fn(),
    };
}

function renderSettings(initialRoute = '/settings') {
    return render(
        <MemoryRouter initialEntries={[initialRoute]}>
            <Routes>
                <Route path="/settings" element={<UserSettings/>}/>
            </Routes>
        </MemoryRouter>
    );
}

describe('UserSettings', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('rag-admin role', () => {
        beforeEach(() => {
            useKeycloak.mockReturnValue(makeRagAdminKeycloakMock());
        });

        it('renders General tab as selected by default', () => {
            const {container} = renderSettings();

            const selectedItem = container.querySelector('.settings-sidebar-item.selected');
            expect(selectedItem).not.toBeNull();
            expect(selectedItem.textContent).toContain('General');
        });

        it('sees RAG in the sidebar', () => {
            const {getByText} = renderSettings();
            expect(getByText('RAG')).toBeDefined();
        });

        it('clicking the RAG tab selects it', () => {
            const {getByText} = renderSettings();

            fireEvent.click(getByText('RAG'));

            const selectedItem = getByText('RAG').closest('.settings-sidebar-item');
            expect(selectedItem.classList.contains('selected')).toBe(true);
        });

        it('clicking the Atlassian tab selects it', () => {
            const {getByText} = renderSettings();

            fireEvent.click(getByText('Atlassian'));

            const selectedItem = getByText('Atlassian').closest('.settings-sidebar-item');
            expect(selectedItem.classList.contains('selected')).toBe(true);
        });

        it('clicking the Google tab selects it', () => {
            const {getByText} = renderSettings();

            fireEvent.click(getByText('Google'));

            const selectedItem = getByText('Google').closest('.settings-sidebar-item');
            expect(selectedItem.classList.contains('selected')).toBe(true);
        });
    });

    describe('non-admin role', () => {
        beforeEach(() => {
            useKeycloak.mockReturnValue(makeRegularUserKeycloakMock());
        });

        it('does not see RAG in the sidebar', () => {
            const {queryByText} = renderSettings();
            expect(queryByText('RAG')).toBeNull();
        });

        it('defaults to the General panel', () => {
            const {container} = renderSettings();
            const selectedItem = container.querySelector('.settings-sidebar-item.selected');
            expect(selectedItem).not.toBeNull();
            expect(selectedItem.textContent).toContain('General');
        });

        it('sees General in the sidebar', () => {
            const {getByText} = renderSettings();
            expect(getByText('General')).toBeDefined();
        });

        it('sees Atlassian in the sidebar', () => {
            const {getByText} = renderSettings();
            expect(getByText('Atlassian')).toBeDefined();
        });

        it('sees Google in the sidebar', () => {
            const {getByText} = renderSettings();
            expect(getByText('Google')).toBeDefined();
        });
    });
});
