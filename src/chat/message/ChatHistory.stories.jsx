import { expect, fn, waitFor } from 'storybook/test';
import ChatHistory from './ChatHistory.jsx';

/*
 * chatService.findChatHistory and chatGroupService.findGroups are mocked in msw-handlers.js —
 * both only fire while `drawerOpen` is true. Chat/drawer state (chatId, streamingChatId, etc.)
 * comes from the shared preview's real SharedDataProvider.
 */
const meta = {
    component: ChatHistory,
    tags: ['ai-generated'],
};

export default meta;

export const Open = {
    args: {
        userId: 'storybook-user',
        drawerOpen: true,
        setDrawerOpen: fn(),
    },
    play: async ({ canvas, userEvent }) => {
        await waitFor(() => expect(canvas.getByText('Weekend trip planning')).toBeVisible());

        /* Every day bucket but the first starts collapsed. */
        const yesterdayHeader = canvas.getByRole('button', { name: 'Yesterday' });
        await expect(yesterdayHeader).toHaveAttribute('aria-expanded', 'false');

        await userEvent.click(yesterdayHeader);
        /* The 25-char row label truncates the message, so match a prefix rather than the full text. */
        await expect(canvas.getByText(/^What is the capital/)).toBeVisible();
    },
};

export const Closed = {
    args: {
        userId: 'storybook-user',
        drawerOpen: false,
        setDrawerOpen: fn(),
    },
    play: async ({ canvas }) => {
        /* Inactive while closed, so usePagedChatHistory/useChatGroups never fetch. */
        await expect(canvas.queryByText('Weekend trip planning')).not.toBeInTheDocument();
    },
};
