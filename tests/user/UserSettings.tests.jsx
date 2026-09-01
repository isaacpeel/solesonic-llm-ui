import {render, fireEvent} from '@testing-library/react';
import {MemoryRouter, Routes, Route} from 'react-router';
import UserSettings from '../../src/user/UserSettings.jsx';
import {describe, it, vi, expect, beforeEach, afterEach} from 'vitest';
import {useKeycloak} from '../../src/providers/KeycloakProvider.jsx';
import { ROLES } from '../../src/authorizer/roles.js';

vi.mock('../../src/providers/KeycloakProvider.jsx', () => ({
    useKeycloak: vi.fn(),
}));

vi.mock('../../src/service/AtlassianAuthService.js', () => ({
    default: {
        authUri: vi.fn().mockResolvedValue({uri: 'https://atlassian.example.com/oauth'}),
        authCallback: vi.fn((code) => {
            if (code === '12345') {
                return Promise.resolve({tokens: {accessToken: 'mock-token'}});
            }
            return Promise.reject(new Error('Invalid code'));
        }),
    },
}));

vi.mock('../../src/service/OllamaService.js', () => ({
    default: {
        models: vi.fn().mockResolvedValue([
            {
                name: 'model1',
                censored: false,
                ollamaModel: {
                    model: 'model1',
                    details: {
                        parentModel: 'parent1',
                        format: 'format1',
                        families: ['family'],
                        parameter_size: '7B',
                        quantization_level: '4k',
                    },
                },
                ollamaShow: {
                    capabilities: []
                }
            },
            {
                name: 'Model2',
                model: 'model2',
                censored: false,
                ollamaModel: {
                    model: 'model2',
                    details: {
                        parameter_size: '13B',
                    },
                },
                ollamaShow: {
                    capabilities: []
                }
            },
        ]),
        installedModels: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('../../src/service/UserPreferencesService.js', () => ({
    default: {
        get: vi.fn().mockResolvedValue({model: 'model1'}),
    },
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getAccessToken: vi.fn().mockResolvedValue({tokens: {accessToken: 'fake-access-token'}}),
    }
}))

function makeModelAdminKeycloakMock() {
    return {
        keycloak: {},
        authenticated: true,
        loading: false,
        user: {name: 'Admin User', roles: ['model-admin']},
        hasRole: (role) => role === 'model-admin',
        roles: ['model-admin'],
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

describe('SETTINGS_CONFIG', () => {
    it('every entry has a key and label', () => {
        for (const item of SETTINGS_CONFIG) {
            expect(item.key).toBeTruthy();
            expect(item.label).toBeTruthy();
        }
    });

    it('every requiredRole is a known ROLES constant', () => {
        const knownRoles = new Set(Object.values(ROLES));
        for (const item of SETTINGS_CONFIG) {
            if (item.requiredRole) {
                expect(knownRoles.has(item.requiredRole)).toBe(true);
            }
        }
    });
});

describe('UserSettings', () => {
    beforeEach(() => {
        useKeycloak.mockReturnValue(makeModelAdminKeycloakMock());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('renders Chat Model tab as selected by default for model-admin users', () => {
        const {container} = renderSettings();

        const selectedItem = container.querySelector('.settings-sidebar-item.selected');
        expect(selectedItem).not.toBeNull();
        expect(selectedItem.textContent).toContain('Chat Model');
    });

    it('clicking the Ollama Models tab selects it', () => {
        const {getByText} = renderSettings();

        fireEvent.click(getByText('Ollama Models'));

        const selectedItem = getByText('Ollama Models').closest('.settings-sidebar-item');
        expect(selectedItem.classList.contains('selected')).toBe(true);
    });

    it('clicking the Atlassian tab selects it', () => {
        const {getByText} = renderSettings();

        fireEvent.click(getByText('Atlassian'));

        const selectedItem = getByText('Atlassian').closest('.settings-sidebar-item');
        expect(selectedItem.classList.contains('selected')).toBe(true);
    });

    it('clicking the General tab selects it', () => {
        const {getByText} = renderSettings();

        fireEvent.click(getByText('General'));

        const selectedItem = getByText('General').closest('.settings-sidebar-item');
        expect(selectedItem.classList.contains('selected')).toBe(true);
    });

    describe('model-admin role', () => {
        it('sees Chat Model in the sidebar', () => {
            const {getByText} = renderSettings();
            expect(getByText('Chat Model')).toBeDefined();
        });

        it('sees Ollama Models in the sidebar', () => {
            const {getByText} = renderSettings();
            expect(getByText('Ollama Models')).toBeDefined();
        });

        it('can navigate to the Chat Model panel', () => {
            const {getByText} = renderSettings();
            fireEvent.click(getByText('Chat Model'));
            const selectedItem = getByText('Chat Model').closest('.settings-sidebar-item');
            expect(selectedItem.classList.contains('selected')).toBe(true);
        });

        it('can navigate to the Ollama Models panel', () => {
            const {getByText} = renderSettings();
            fireEvent.click(getByText('Ollama Models'));
            const selectedItem = getByText('Ollama Models').closest('.settings-sidebar-item');
            expect(selectedItem.classList.contains('selected')).toBe(true);
        });
    });

    describe('non-admin role', () => {
        beforeEach(() => {
            useKeycloak.mockReturnValue(makeRegularUserKeycloakMock());
        });

        it('does not see Chat Model in the sidebar', () => {
            const {queryByText} = renderSettings();
            expect(queryByText('Chat Model')).toBeNull();
        });

        it('does not see Ollama Models in the sidebar', () => {
            const {queryByText} = renderSettings();
            expect(queryByText('Ollama Models')).toBeNull();
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
    });
});
