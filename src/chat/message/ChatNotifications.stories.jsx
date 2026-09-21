import { expect } from 'storybook/test';
import ChatNotifications from './ChatNotifications.jsx';

const meta = {
    component: ChatNotifications,
    tags: ['ai-generated'],
};

export default meta;

export const Streaming = {
    args: {
        notifications: ['Searching documentation…', 'Reading 3 files…'],
        isStreaming: true,
        messageKey: 'msg-1',
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('Reading 3 files…')).toBeVisible();
    },
};

export const CompletedCollapsed = {
    args: {
        notifications: ['Searched documentation', 'Read 3 files', 'Wrote summary'],
        isStreaming: false,
        messageKey: 'msg-2',
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByRole('button', { name: /3 steps completed/i })).toHaveAttribute('aria-expanded', 'false');
    },
};

export const ExpandsOnClick = {
    args: {
        notifications: ['Searched documentation', 'Read 3 files', 'Wrote summary'],
        isStreaming: false,
        messageKey: 'msg-3',
    },
    play: async ({ canvas, userEvent }) => {
        await userEvent.click(canvas.getByRole('button', { name: /3 steps completed/i }));

        await expect(canvas.getByText('Wrote summary')).toBeVisible();
    },
};
