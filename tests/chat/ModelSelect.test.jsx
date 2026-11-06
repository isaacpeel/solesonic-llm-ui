import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, fireEvent, cleanup, waitFor} from '@testing-library/react';
import ModelSelect from '../../src/chat/header/ModelSelect.jsx';

function fakeChatModel(overrides = {}) {
    return {
        options: {models: [{id: 'qwen3.5-9b'}, {id: 'openai/gpt-4o'}], defaultModel: 'qwen3.5-9b', selectedModel: null, activeAgent: null},
        defaultModel: 'qwen3.5-9b',
        selectedModel: null,
        pendingModel: null,
        displayModel: 'qwen3.5-9b',
        savingModel: false,
        loadingOptions: false,
        pickerError: null,
        refreshOptions: vi.fn(),
        choose: vi.fn().mockResolvedValue(true),
        resetToDefault: vi.fn().mockResolvedValue(true),
        openPicker: vi.fn(),
        ...overrides,
    };
}

describe('ModelSelect', () => {
    afterEach(() => cleanup());

    it('labels models by display name, hides ui_hidden ones, and still picks by id', async () => {
        const chatModel = fakeChatModel({
            options: {
                models: [
                    {id: 'auto-kev', displayName: 'auto', hidden: false},
                    {id: 'nba-agent', displayName: 'nba-agent', hidden: true},
                    {id: 'qwen3.5-9b', displayName: 'qwen3.5-9b', hidden: false},
                ],
                defaultModel: 'auto-kev',
                selectedModel: null,
                activeAgent: null,
            },
            displayModel: 'auto-kev',
            displayLabel: 'auto',
        });
        render(<ModelSelect chatModel={chatModel}/>);

        fireEvent.click(screen.getByRole('button', {name: 'Model: auto'}));

        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['auto', 'qwen3.5-9b']);

        fireEvent.click(screen.getByRole('option', {name: 'qwen3.5-9b'}));

        await waitFor(() => expect(chatModel.choose).toHaveBeenCalledWith('qwen3.5-9b'));
    });

    it('shows the current model and lists the models with the selection marked', () => {
        const chatModel = fakeChatModel({selectedModel: 'openai/gpt-4o', displayModel: 'openai/gpt-4o'});
        render(<ModelSelect chatModel={chatModel}/>);

        const button = screen.getByRole('button', {name: 'Model: openai/gpt-4o'});
        fireEvent.click(button);

        expect(chatModel.refreshOptions).toHaveBeenCalled();
        expect(chatModel.openPicker).not.toHaveBeenCalled();
        expect(screen.getByRole('option', {name: 'openai/gpt-4o'}).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByRole('option', {name: 'qwen3.5-9b'}).getAttribute('aria-selected')).toBe('false');
    });

    it('marks the default model when no model was chosen, and has no Default row', () => {
        render(<ModelSelect chatModel={fakeChatModel()}/>);

        fireEvent.click(screen.getByRole('button', {name: /Model:/}));

        expect(screen.getAllByRole('option')).toHaveLength(2);
        expect(screen.getByRole('option', {name: 'qwen3.5-9b'}).getAttribute('aria-selected')).toBe('true');
    });

    it('picks a model and closes', async () => {
        const chatModel = fakeChatModel();
        render(<ModelSelect chatModel={chatModel}/>);

        fireEvent.click(screen.getByRole('button', {name: /Model:/}));
        fireEvent.click(screen.getByRole('option', {name: 'openai/gpt-4o'}));

        await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
        expect(chatModel.choose).toHaveBeenCalledWith('openai/gpt-4o');
        expect(chatModel.openPicker).not.toHaveBeenCalled();
    });

    it('picking the model already in use just closes', async () => {
        const chatModel = fakeChatModel();
        render(<ModelSelect chatModel={chatModel}/>);

        fireEvent.click(screen.getByRole('button', {name: /Model:/}));
        fireEvent.click(screen.getByRole('option', {name: 'qwen3.5-9b'}));

        await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
        expect(chatModel.choose).not.toHaveBeenCalled();
    });

    it('stays open and says so when the change fails', async () => {
        const chatModel = fakeChatModel({choose: vi.fn().mockResolvedValue(false), pickerError: 'failed'});
        render(<ModelSelect chatModel={chatModel}/>);

        fireEvent.click(screen.getByRole('button', {name: /Model:/}));
        fireEvent.click(screen.getByRole('option', {name: 'openai/gpt-4o'}));

        await waitFor(() => expect(chatModel.choose).toHaveBeenCalled());
        expect(screen.getByRole('listbox')).toBeTruthy();
        expect(screen.getByRole('alert').textContent).toContain('could not be changed');
    });

    it('picks with the keyboard', async () => {
        const chatModel = fakeChatModel();
        render(<ModelSelect chatModel={chatModel}/>);

        fireEvent.keyDown(screen.getByRole('button', {name: /Model:/}), {key: 'ArrowDown'});
        const list = screen.getByRole('listbox');
        fireEvent.keyDown(list, {key: 'ArrowDown'});
        fireEvent.keyDown(list, {key: 'ArrowDown'});
        fireEvent.keyDown(list, {key: 'ArrowDown'});
        fireEvent.keyDown(list, {key: 'Enter'});

        await waitFor(() => expect(chatModel.choose).toHaveBeenCalledWith('openai/gpt-4o'));
    });
});
