import {render, waitFor, fireEvent} from '@testing-library/react';
import {MemoryRouter, Routes, Route} from 'react-router-dom';
import UserSettings from '../../src/user/UserSettings.jsx';
import {describe, it, vi, expect} from 'vitest';
import AtlassianAuthService from "../../src/service/AtlassianAuthService.js";

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
    it('calls authCallback once per mount when the page is refreshed', async () => {
        const initialRoute = '/settings/?code=12345';

        const {rerender} = render(
            <MemoryRouter initialEntries={[initialRoute]}>
                <Routes>
                    <Route path="/settings" element={<UserSettings/>}/>
                </Routes>
            </MemoryRouter>
        );

        const mockAuthCallback = AtlassianAuthService.authCallback;

        await waitFor(() => expect(mockAuthCallback).toHaveBeenCalledTimes(1));

        expect(mockAuthCallback).toHaveBeenCalledWith('12345');

        rerender(
            <MemoryRouter initialEntries={[initialRoute]}>
                <Routes>
                    <Route path="/settings" element={<UserSettings/>}/>
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => expect(mockAuthCallback).toHaveBeenCalledTimes(1));
    });

    it('renders Chat Model tab as selected by default', () => {
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
});
