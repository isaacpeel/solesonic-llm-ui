import { expect, fn, waitFor } from 'storybook/test';
import ChatMessage, { USER, AI, SYSTEM } from './ChatMessage.jsx';

const meta = {
    component: ChatMessage,
    tags: ['ai-generated'],
};

export default meta;

export const UserMessage = {
    args: {
        message: {
            _key: 'u1',
            type: USER,
            text: 'Can you help me plan a weekend trip to the coast?',
        },
    },
};

export const AssistantMessage = {
    args: {
        message: {
            _key: 'a1',
            type: AI,
            text: 'Sure — here are three coastal towns worth considering.',
            model: 'llama3',
            responseMetadata: { promptTokens: 120, totalTokens: 180, promptMillis: 850 },
        },
        onExpandImage: fn(),
    },
    play: async ({ canvas, canvasElement, userEvent }) => {
        /* .message-actions is opacity:0 until the row is hovered or revealed. */
        await userEvent.hover(canvasElement.querySelector('.message-with-actions'));

        await waitFor(() => expect(canvas.getByText('llama3')).toBeVisible());
        await expect(canvas.getByRole('button', { name: 'Copy message as markdown' })).toBeVisible();
    },
};

export const StreamingAssistant = {
    args: {
        message: {
            _key: 's1',
            type: AI,
            text: '',
            isStreaming: true,
        },
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('Thinking...')).toBeVisible();
    },
};

export const AssistantWithNotifications = {
    args: {
        message: {
            _key: 'n1',
            type: AI,
            text: 'Done — I searched the docs and found the answer.',
            isStreaming: false,
            model: 'qwen3.5-9b',
            notifications: ['Searching documentation…', 'Reading 3 matching pages…'],
        },
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('2 steps completed')).toBeVisible();
    },
};

export const SystemMessage = {
    args: {
        message: {
            _key: 'sys1',
            type: SYSTEM,
            text: 'The model was switched to qwen3.5-9b for this conversation.',
        },
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('The model was switched to qwen3.5-9b for this conversation.')).toBeVisible();
    },
};

export const ElicitationResolved = {
    args: {
        message: {
            _key: 'e1',
            type: SYSTEM,
            text: 'Deploy the change to production?',
            elicitationResponse: 'accept',
        },
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('Deploy the change to production?')).toBeVisible();
        await expect(canvas.getByText(/Accept/)).toBeVisible();
    },
};

export const ElicitationDeclined = {
    args: {
        message: {
            _key: 'ed1',
            type: SYSTEM,
            text: 'Remove this document from the RAG index?',
            elicitationResponse: 'decline',
        },
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('Remove this document from the RAG index?')).toBeVisible();
        await expect(canvas.getByText(/Decline/)).toBeVisible();
    },
};

export const ErrorMessage = {
    args: {
        message: {
            _key: 'err1',
            type: AI,
            text: 'The model backend timed out. Please try again.',
            isError: true,
        },
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByRole('alert')).toBeVisible();
    },
};
