import {render, waitFor, fireEvent} from '@testing-library/react';
import {describe, it, vi, expect, beforeEach} from 'vitest';
import OllamaModelSettings from '../../src/user/OllamaModelSettings.jsx';

vi.mock('../../src/service/OllamaService.js', () => ({
    default: {
        models: vi.fn(),
        installedModels: vi.fn(),
        createModel: vi.fn(),
        updateModel: vi.fn(),
    },
}));

vi.mock('react-toastify', () => ({
    toast: Object.assign(vi.fn(), {error: vi.fn()}),
    ToastContainer: () => null,
    Bounce: {},
}));

import ollamaService from '../../src/service/OllamaService.js';

const configuredModel = {
    id: 'cfg-1',
    name: 'llama3',
    censored: false,
    ollamaModel: {
        model: 'llama3',
        details: {parameter_size: '8B'},
    },
    ollamaShow: {capabilities: []},
};

describe('OllamaModelSettings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ollamaService.models.mockResolvedValue([configuredModel]);
        ollamaService.installedModels.mockResolvedValue([]);
    });

    it('renders the models sidebar and detail panel', async () => {
        const {container} = render(<OllamaModelSettings/>);

        await waitFor(() => {
            expect(container.querySelector('.ollama-model-settings-container')).not.toBeNull();
            expect(container.querySelector('.models-sidebar')).not.toBeNull();
            expect(container.querySelector('.model-detail-panel')).not.toBeNull();
        });
    });

    it('shows configured model in the sidebar after loading', async () => {
        const {getAllByText} = render(<OllamaModelSettings/>);

        await waitFor(() => {
            expect(getAllByText('llama3').length).toBeGreaterThanOrEqual(1);
        });
    });

    it('selecting a model shows its detail panel with Configured status', async () => {
        const {getAllByText, container} = render(<OllamaModelSettings/>);

        await waitFor(() => getAllByText('llama3'));

        const sidebarItem = container.querySelector('.model-list-item');
        fireEvent.click(sidebarItem);

        await waitFor(() => {
            const badge = container.querySelector('.model-status-badge');
            expect(badge).not.toBeNull();
            expect(badge.textContent).toBe('Configured');
        });
    });

    it('shows empty state when no model is selected and none are loaded', async () => {
        ollamaService.models.mockResolvedValue([]);

        const {getByText} = render(<OllamaModelSettings/>);

        await waitFor(() => {
            expect(getByText('Select a model to view its details.')).toBeDefined();
        });
    });

    it('shows toast error when models fail to load', async () => {
        const {toast} = await import('react-toastify');
        ollamaService.models.mockRejectedValue(new Error('network'));

        render(<OllamaModelSettings/>);

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalled();
        });
    });

    it('shows available-to-add section when installedModels includes unconfigured models', async () => {
        const installedModel = {
            name: 'mistral',
            ollamaModel: {model: 'mistral', details: {parameter_size: '7B'}},
            ollamaShow: {capabilities: []},
        };
        ollamaService.installedModels.mockResolvedValue([installedModel]);

        const {getByText} = render(<OllamaModelSettings/>);

        await waitFor(() => {
            expect(getByText('Available to Add')).toBeDefined();
            expect(getByText('mistral')).toBeDefined();
        });
    });
});
