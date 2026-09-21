import { expect, fn, waitFor, within } from 'storybook/test';
import DeleteChatDialog from './DeleteChatDialog.jsx';

const meta = {
    component: DeleteChatDialog,
    tags: ['ai-generated'],
};

export default meta;

/* Portalled to document.body, so it must be queried through canvasElement.ownerDocument. */
export const Default = {
    args: {
        chatId: 'chat-1',
        label: 'Weekend trip planning',
        streaming: false,
        onCancel: fn(),
        onDeleted: fn(),
    },
    play: async ({ canvasElement, userEvent, args }) => {
        const body = within(canvasElement.ownerDocument.body);
        await expect(body.getByRole('dialog', { name: 'Delete conversation?' })).toBeVisible();

        await userEvent.click(body.getByRole('button', { name: 'Cancel' }));
        await expect(args.onCancel).toHaveBeenCalledTimes(1);
    },
};

export const StreamingDisablesDelete = {
    args: {
        chatId: 'chat-2',
        label: 'Active conversation',
        streaming: true,
        onCancel: fn(),
        onDeleted: fn(),
    },
    play: async ({ canvasElement }) => {
        const body = within(canvasElement.ownerDocument.body);
        await expect(body.getByRole('button', { name: 'Delete' })).toBeDisabled();
    },
};

/* The confirm button hits chatService.deleteChat — mocked in .storybook/msw-handlers.js. */
export const ConfirmDeletes = {
    args: {
        chatId: 'chat-42',
        label: 'Notes from the planning meeting',
        streaming: false,
        onCancel: fn(),
        onDeleted: fn(),
    },
    play: async ({ canvasElement, userEvent, args }) => {
        const body = within(canvasElement.ownerDocument.body);

        await userEvent.click(body.getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(args.onDeleted).toHaveBeenCalledWith('chat-42'));
    },
};
