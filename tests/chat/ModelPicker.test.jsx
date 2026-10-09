import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, fireEvent, screen} from '@testing-library/react';
import ModelPicker from '../../src/chat/command/ModelPicker.jsx';

const modelOptions = {
    models: [
        {id: 'qwen3-8b', ownedBy: 'local'},
        {id: 'openai/gpt-4o', ownedBy: 'openai'},
        {id: 'openai/gpt-4o-mini', ownedBy: 'openai'},
        {id: 'mistral-small', ownedBy: null},
    ],
    defaultModel: 'qwen3-8b',
    selectedModel: null,
    activeAgent: null,
};

function renderPicker(props = {}) {
    const handlers = {
        onChoose: vi.fn(),
        onResetToDefault: vi.fn(),
        onRetry: vi.fn(),
        onClose: vi.fn(),
    };

    const rendered = render(
        <ModelPicker
            options={modelOptions}
            loading={false}
            saving={false}
            error={null}
            pendingModel={null}
            {...handlers}
            {...props}
        />
    );

    return {...handlers, ...rendered};
}

function modelRows(container) {
    return Array.from(container.querySelectorAll('.model-picker-item:not(.model-picker-item--reset)'));
}

function rowFor(container, modelId) {
    return modelRows(container).find((row) => row.querySelector('.model-picker-item-name').textContent === modelId);
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('ModelPicker rows', () => {
    it('lists every offered model with its owner', () => {
        const {container} = renderPicker();

        expect(modelRows(container).map((row) => row.querySelector('.model-picker-item-name').textContent))
            .toEqual(['qwen3-8b', 'openai/gpt-4o', 'openai/gpt-4o-mini', 'mistral-small']);
        expect(rowFor(container, 'openai/gpt-4o').querySelector('.model-picker-item-owner').textContent).toBe('openai');
        expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    });

    it('renders a model without an owner and no owner span', () => {
        const {container} = renderPicker();

        const ownerlessRow = rowFor(container, 'mistral-small');
        expect(ownerlessRow).toBeTruthy();
        expect(ownerlessRow.querySelector('.model-picker-item-owner')).toBeNull();
    });

    it('marks the default as current when nothing is selected', () => {
        const {container} = renderPicker();

        const defaultRow = rowFor(container, 'qwen3-8b');
        expect(defaultRow.querySelector('.model-picker-badge--default')).not.toBeNull();
        expect(defaultRow.querySelector('.model-picker-badge--current')).not.toBeNull();
        expect(container.querySelectorAll('.model-picker-badge--current')).toHaveLength(1);
    });

    it('marks the chat selection as current', () => {
        const {container} = renderPicker({options: {...modelOptions, selectedModel: 'openai/gpt-4o'}});

        expect(rowFor(container, 'openai/gpt-4o').querySelector('.model-picker-badge--current')).not.toBeNull();
        expect(rowFor(container, 'qwen3-8b').querySelector('.model-picker-badge--current')).toBeNull();
        expect(rowFor(container, 'qwen3-8b').querySelector('.model-picker-badge--default')).not.toBeNull();
    });

    it('marks a new chat pending pick as current', () => {
        const {container} = renderPicker({pendingModel: 'openai/gpt-4o-mini'});

        expect(rowFor(container, 'openai/gpt-4o-mini').querySelector('.model-picker-badge--current')).not.toBeNull();
    });

    it('offers "Use default" only when a selection exists', () => {
        const {container: noSelection} = renderPicker();
        expect(noSelection.querySelector('.model-picker-item--reset')).toBeNull();

        const {container: withSelection, onResetToDefault} = renderPicker({options: {...modelOptions, selectedModel: 'openai/gpt-4o'}});
        const resetRow = withSelection.querySelector('.model-picker-item--reset');
        expect(resetRow.textContent).toContain('qwen3-8b');

        fireEvent.mouseDown(resetRow);
        expect(onResetToDefault).toHaveBeenCalledTimes(1);
    });

    it('picks a model on mouse down', () => {
        const {container, onChoose} = renderPicker();

        fireEvent.mouseDown(rowFor(container, 'openai/gpt-4o'));

        expect(onChoose).toHaveBeenCalledWith('openai/gpt-4o');
    });

    it('ignores picks while a change is being saved', () => {
        const {container, onChoose} = renderPicker({saving: true});

        fireEvent.mouseDown(rowFor(container, 'openai/gpt-4o'));

        expect(onChoose).not.toHaveBeenCalled();
    });

    it('says which agent the chat is routed to', () => {
        const {container} = renderPicker({options: {...modelOptions, activeAgent: 'weather-agent'}});

        expect(container.querySelector('.model-picker-agent').textContent).toContain('weather-agent');
    });

    it('shows no agent line when the chat is not routed to one', () => {
        const {container} = renderPicker();

        expect(container.querySelector('.model-picker-agent')).toBeNull();
    });
});

describe('ModelPicker filter and keyboard', () => {
    it('narrows rows by a case-insensitive substring of the id', () => {
        const {container} = renderPicker();

        fireEvent.change(container.querySelector('.model-picker-filter'), {target: {value: 'GPT-4O'}});

        expect(modelRows(container).map((row) => row.querySelector('.model-picker-item-name').textContent))
            .toEqual(['openai/gpt-4o', 'openai/gpt-4o-mini']);
    });

    it('says so when the filter matches nothing', () => {
        const {container} = renderPicker();

        fireEvent.change(container.querySelector('.model-picker-filter'), {target: {value: 'llama'}});

        expect(modelRows(container)).toHaveLength(0);
        expect(container.querySelector('.model-picker-message').textContent).toContain('No models match');
    });

    it('moves with the arrow keys and picks with Enter', () => {
        const {container, onChoose} = renderPicker();
        const filter = container.querySelector('.model-picker-filter');

        fireEvent.keyDown(filter, {key: 'ArrowDown'});
        fireEvent.keyDown(filter, {key: 'ArrowDown'});
        fireEvent.keyDown(filter, {key: 'ArrowDown'});
        fireEvent.keyDown(filter, {key: 'ArrowUp'});

        expect(rowFor(container, 'openai/gpt-4o').getAttribute('aria-selected')).toBe('true');

        fireEvent.keyDown(filter, {key: 'Enter'});

        expect(onChoose).toHaveBeenCalledWith('openai/gpt-4o');
    });

    it('picks the only remaining row on Enter', () => {
        const {container, onChoose} = renderPicker();
        const filter = container.querySelector('.model-picker-filter');

        fireEvent.change(filter, {target: {value: 'mini'}});
        fireEvent.keyDown(filter, {key: 'Enter'});

        expect(onChoose).toHaveBeenCalledWith('openai/gpt-4o-mini');
    });

    it('does nothing on Enter with several rows and none highlighted', () => {
        const {container, onChoose} = renderPicker();

        fireEvent.keyDown(container.querySelector('.model-picker-filter'), {key: 'Enter'});

        expect(onChoose).not.toHaveBeenCalled();
    });

    it('closes on Escape', () => {
        const {container, onClose} = renderPicker();

        fireEvent.keyDown(container.querySelector('.model-picker-filter'), {key: 'Escape'});

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on a mouse down outside it, but not inside it', () => {
        const {container, onClose} = renderPicker();

        fireEvent.mouseDown(container.querySelector('.model-picker-filter'));
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.mouseDown(document.body);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('focuses the filter when it opens', () => {
        const {container} = renderPicker();

        expect(document.activeElement).toBe(container.querySelector('.model-picker-filter'));
    });
});

describe('ModelPicker states', () => {
    it('shows loading while the options are on their way', () => {
        const {container} = renderPicker({options: null, loading: true});

        expect(container.querySelector('.model-picker-message').textContent).toContain('Loading');
        expect(container.querySelector('[role="listbox"]')).toBeNull();
    });

    it('offers Retry when the list could not be loaded', () => {
        const {container, onRetry} = renderPicker({options: null, error: 'unavailable'});

        expect(screen.getByText('The model list could not be loaded.')).toBeTruthy();

        fireEvent.click(container.querySelector('.model-picker-retry'));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('explains a pick that is no longer offered, above the list', () => {
        const {container} = renderPicker({error: 'unknown'});

        expect(container.querySelector('.model-picker-message--error').textContent).toContain('no longer available');
        expect(modelRows(container)).toHaveLength(4);
    });

    it('explains a change that failed', () => {
        const {container} = renderPicker({error: 'failed'});

        expect(container.querySelector('.model-picker-message--error').textContent).toContain('could not be changed');
    });

    it('says so when the server offers no models', () => {
        const {container} = renderPicker({options: {...modelOptions, models: []}});

        expect(container.querySelector('.model-picker-message').textContent).toBe('No models are available.');
    });
});
