import { expect } from 'storybook/test';
import ChatScreen from './ChatScreen.jsx';

/*
 * The whole chat page. Takes no props — everything comes from useSharedData() (the shared
 * preview's real SharedDataProvider) and its own hooks. Only the initial "new chat" render is
 * covered: submitting a message opens a real SSE stream (useChatStream), which is a bigger
 * integration than this pass covers.
 */
const meta = {
    component: ChatScreen,
    tags: ['ai-generated'],
};

export default meta;

export const NewChat = {
    play: async ({ canvas }) => {
        await expect(canvas.getByText('Hi! How can I assist you today?')).toBeVisible();
        await expect(canvas.getByPlaceholderText('Type a message...')).toBeVisible();
        await expect(canvas.getByRole('button', { name: 'Send message' })).toBeDisabled();
    },
};

export const DraftMessage = {
    play: async ({ canvas, userEvent }) => {
        await userEvent.type(canvas.getByPlaceholderText('Type a message...'), 'What is the capital of France?', { delay: 10 });
        await expect(canvas.getByRole('button', { name: 'Send message' })).toBeEnabled();
    },
};
