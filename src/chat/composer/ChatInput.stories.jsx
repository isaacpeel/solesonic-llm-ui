import { useRef } from 'react';
import { expect, fn } from 'storybook/test';
import ChatInput from './ChatInput.jsx';

/* chatInputRef/composerContainerRef must be real refs, so each story supplies them via render. */
function withRefs(args) {
    const chatInputRef = useRef(null);
    const composerContainerRef = useRef(null);

    return <ChatInput {...args} chatInputRef={chatInputRef} composerContainerRef={composerContainerRef} />;
}

const BASE_ARGS = {
    loading: false,
    inputValue: '',
    handleInputChange: fn(),
    handleSubmit: fn(() => Promise.resolve()),
    commandCandidates: [],
    selectedIndex: -1,
    selectedCommand: null,
    isPinned: false,
    onTogglePin: fn(),
    onCommandSelect: fn(),
    onArrowUp: fn(),
    onArrowDown: fn(),
    onDismiss: fn(),
    onDeselect: fn(),
    trayEntries: [],
    addFiles: fn(),
    removeEntry: fn(),
    retryEntry: fn(),
    setEntryCaption: fn(),
    trayError: null,
    onCaptionOpenChange: fn(),
};

const meta = {
    component: ChatInput,
    tags: ['ai-generated'],
};

export default meta;

export const Empty = {
    render: withRefs,
    args: { ...BASE_ARGS },
    play: async ({ canvas }) => {
        await expect(canvas.getByRole('button', { name: 'Send message' })).toBeDisabled();
    },
};

export const Typing = {
    render: withRefs,
    args: { ...BASE_ARGS, inputValue: 'What should I pack for a weekend trip?' },
    play: async ({ canvas }) => {
        await expect(canvas.getByRole('button', { name: 'Send message' })).toBeEnabled();
    },
};

export const Loading = {
    render: withRefs,
    args: { ...BASE_ARGS, loading: true, inputValue: 'What should I pack for a weekend trip?' },
    play: async ({ canvas, canvasElement }) => {
        await expect(canvas.getByRole('button', { name: 'Send message' })).toBeDisabled();
        await expect(canvasElement.querySelector('.dots-loader')).toBeVisible();
    },
};

export const SlashCommandSuggestions = {
    render: withRefs,
    args: {
        ...BASE_ARGS,
        inputValue: '/sum',
        commandCandidates: [
            { command: 'summarize', description: 'Summarize the conversation so far' },
            { command: 'summary-export', description: 'Export a summary as a document' },
        ],
        selectedIndex: 0,
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByRole('option', { name: /summarize/i })).toHaveAttribute('aria-selected', 'true');
    },
};

export const CommandSelected = {
    render: withRefs,
    args: {
        ...BASE_ARGS,
        selectedCommand: { command: 'summarize', description: 'Summarize the conversation so far' },
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('/summarize')).toBeVisible();
    },
};
