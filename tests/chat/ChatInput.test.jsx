import {describe, it, expect, vi, afterEach} from 'vitest';
import {createRef} from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react';
import ChatInput from '../../src/chat/composer/ChatInput.jsx';

function defaultChatInputProps() {
    return {
        loading: false,
        streamActive: false,
        onStopChat: vi.fn(),
        inputValue: '',
        handleInputChange: vi.fn(),
        handleSubmit: vi.fn().mockResolvedValue(undefined),
        chatInputRef: createRef(),
        commandCandidates: [],
        selectedIndex: -1,
        selectedCommand: null,
        isPinned: false,
        onTogglePin: vi.fn(),
        onCommandSelect: vi.fn(),
        onArrowUp: vi.fn(),
        onArrowDown: vi.fn(),
        onDismiss: vi.fn(),
        onDeselect: vi.fn(),
        trayEntries: [],
        addFiles: vi.fn(),
        removeEntry: vi.fn(),
        retryEntry: vi.fn(),
        setEntryCaption: vi.fn(),
        trayError: null,
        onCaptionOpenChange: vi.fn(),
    };
}

function renderChatInput(props = {}) {
    return render(<ChatInput {...defaultChatInputProps()} {...props}/>);
}

const summarizeCommand = {
    commandType: 'prompt',
    command: 'summarize',
    name: 'summarize',
    description: 'Summarize the conversation, optionally focused on a topic: /summarize <topic>',
};

function buildModelPicker(overrides = {}) {
    return {
        pickerOpen: true,
        options: {models: [{id: 'qwen3-8b', ownedBy: 'local'}], defaultModel: 'qwen3-8b', selectedModel: null, activeAgent: null},
        loadingOptions: false,
        savingModel: false,
        pickerError: null,
        pendingModel: null,
        openPicker: vi.fn(),
        closePicker: vi.fn(),
        choose: vi.fn(),
        resetToDefault: vi.fn(),
        ...overrides,
    };
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('ChatInput send button', () => {
    it('is disabled with no text and no selected command', () => {
        const {container} = renderChatInput();

        expect(container.querySelector('.composer-send-button').disabled).toBe(true);
    });

    it('is enabled for a selected command with no argument', () => {
        const {container} = renderChatInput({selectedCommand: summarizeCommand});

        expect(container.querySelector('.composer-send-button').disabled).toBe(false);
    });

    it('is enabled for plain text without a command', () => {
        const {container} = renderChatInput({inputValue: 'hello'});

        expect(container.querySelector('.composer-send-button').disabled).toBe(false);
    });

    it('stays disabled while a turn is loading, even with a command selected', () => {
        const {container} = renderChatInput({selectedCommand: summarizeCommand, loading: true});

        expect(container.querySelector('.composer-send-button').disabled).toBe(true);
    });

    it('is disabled for a pinned command with no argument', () => {
        const {container} = renderChatInput({selectedCommand: summarizeCommand, isPinned: true});

        expect(container.querySelector('.composer-send-button').disabled).toBe(true);
    });

    it('is enabled for a pinned command with an argument', () => {
        const {container} = renderChatInput({selectedCommand: summarizeCommand, isPinned: true, inputValue: 'pricing'});

        expect(container.querySelector('.composer-send-button').disabled).toBe(false);
    });

    it('is disabled while the model picker is open', () => {
        const {container} = renderChatInput({inputValue: 'hello', modelPicker: buildModelPicker()});

        expect(container.querySelector('.composer-send-button').disabled).toBe(true);
    });
});

describe('ChatInput submitting', () => {
    it('does not send on Enter for a pinned command with no argument', () => {
        const handleSubmit = vi.fn().mockResolvedValue(true);
        const {container} = renderChatInput({selectedCommand: summarizeCommand, isPinned: true, handleSubmit});

        fireEvent.keyDown(container.querySelector('.chat-text-input'), {key: 'Enter'});

        expect(handleSubmit).not.toHaveBeenCalled();
    });

    it('sends on Enter for a freshly selected command with no argument', async () => {
        const handleSubmit = vi.fn().mockResolvedValue(true);
        const onDeselect = vi.fn();
        const {container} = renderChatInput({selectedCommand: summarizeCommand, handleSubmit, onDeselect});

        fireEvent.keyDown(container.querySelector('.chat-text-input'), {key: 'Enter'});

        expect(handleSubmit).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(onDeselect).toHaveBeenCalledTimes(1));
    });

    it('keeps the selected command when the send did not go out', async () => {
        const handleSubmit = vi.fn().mockResolvedValue(false);
        const onDeselect = vi.fn();
        const {container} = renderChatInput({selectedCommand: summarizeCommand, handleSubmit, onDeselect});

        fireEvent.click(container.querySelector('.composer-send-button'));

        await waitFor(() => expect(handleSubmit).toHaveBeenCalledTimes(1));
        await Promise.resolve();
        expect(onDeselect).not.toHaveBeenCalled();
    });

    it('does not send on Enter behind an open model picker', () => {
        const handleSubmit = vi.fn().mockResolvedValue(true);
        const {container} = renderChatInput({inputValue: 'hello', handleSubmit, modelPicker: buildModelPicker()});

        fireEvent.keyDown(container.querySelector('.chat-text-input'), {key: 'Enter'});

        expect(handleSubmit).not.toHaveBeenCalled();
    });
});

describe('ChatInput model picker', () => {
    it('renders the picker only while it is open', () => {
        const {container: closedContainer} = renderChatInput({modelPicker: buildModelPicker({pickerOpen: false})});
        expect(closedContainer.querySelector('.model-picker')).toBeNull();

        const {container: openContainer} = renderChatInput({modelPicker: buildModelPicker()});
        expect(openContainer.querySelector('.composer-popovers .model-picker')).not.toBeNull();
    });

    it('renders without a picker when none is supplied', () => {
        const {container} = renderChatInput();

        expect(container.querySelector('.model-picker')).toBeNull();
    });

    it('routes a pick and Escape to the hook', () => {
        const modelPicker = buildModelPicker();
        const {container} = renderChatInput({modelPicker});

        fireEvent.mouseDown(container.querySelector('.model-picker-item'));
        expect(modelPicker.choose).toHaveBeenCalledWith('qwen3-8b');

        fireEvent.keyDown(container.querySelector('.model-picker-filter'), {key: 'Escape'});
        expect(modelPicker.closePicker).toHaveBeenCalledTimes(1);
    });

    it('wires Retry to reopening the picker', () => {
        const modelPicker = buildModelPicker({options: null, pickerError: 'unavailable'});
        const {container} = renderChatInput({modelPicker});

        fireEvent.click(container.querySelector('.model-picker-retry'));

        expect(modelPicker.openPicker).toHaveBeenCalledTimes(1);
    });

    it('keeps focus in the filter when the selection clears the input, and returns it to the textarea on close', () => {
        const props = {...defaultChatInputProps(), inputValue: '/mod'};
        const {container, rerender} = render(<ChatInput {...props}/>);

        rerender(<ChatInput {...props} inputValue="" modelPicker={buildModelPicker()}/>);

        expect(document.activeElement).toBe(container.querySelector('.model-picker-filter'));

        rerender(<ChatInput {...props} inputValue="" modelPicker={buildModelPicker({pickerOpen: false})}/>);

        expect(document.activeElement).toBe(container.querySelector('.chat-text-input'));
    });
});

describe('ChatInput while a prompt is open', () => {
    it('keeps the textarea and Send usable during the turn, with attachments still locked', () => {
        const {container} = renderChatInput({loading: true, streamActive: true, promptOpen: true, inputValue: 'Sam: toothbrush'});

        const textarea = container.querySelector('.chat-text-input');
        expect(textarea.disabled).toBe(false);
        expect(textarea.getAttribute('placeholder')).toBe('Or type your answer…');
        expect(container.querySelector('.composer-send-button').disabled).toBe(false);
        expect(container.querySelector('.composer-stop-button')).not.toBeNull();
        expect(container.querySelector('.composer-attach-button').disabled).toBe(true);
    });

    it('sends the typed answer on Enter', () => {
        const handleSubmit = vi.fn().mockResolvedValue(true);
        const {container} = renderChatInput({loading: true, streamActive: true, promptOpen: true, inputValue: 'Sam: toothbrush', handleSubmit});

        fireEvent.keyDown(container.querySelector('.chat-text-input'), {key: 'Enter'});

        expect(handleSubmit).toHaveBeenCalledTimes(1);
    });

    it('does not offer slash commands while the turn is running', () => {
        const onCommandSelect = vi.fn();
        const {container} = renderChatInput({
            loading: true,
            promptOpen: true,
            inputValue: '/sum',
            commandCandidates: [summarizeCommand],
            onCommandSelect,
        });

        fireEvent.keyDown(container.querySelector('.chat-text-input'), {key: 'Tab'});

        expect(onCommandSelect).not.toHaveBeenCalled();
        expect(container.querySelector('.slash-command-list')).toBeNull();
    });

    it('locks everything while loading without a prompt, as before', () => {
        const {container} = renderChatInput({loading: true, streamActive: true, inputValue: 'hello'});

        expect(container.querySelector('.chat-text-input').disabled).toBe(true);
        expect(container.querySelector('.composer-send-button')).toBeNull();
        expect(container.querySelector('.composer-attach-button').disabled).toBe(true);
    });
});
