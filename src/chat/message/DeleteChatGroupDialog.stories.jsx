import { expect, fn, waitFor, within } from 'storybook/test';
import DeleteChatGroupDialog from './DeleteChatGroupDialog.jsx';

/*
 * Portalled to document.body. chatGroupService.findGroupChats/deleteGroup and
 * chatService.deleteChat are mocked in msw-handlers.js — the mocked group always contains
 * chat-1 and chat-2.
 */
const meta = {
    component: DeleteChatGroupDialog,
    tags: ['ai-generated'],
};

export default meta;

export const DeletesGroupOnly = {
    args: {
        chatGroupId: 'group-1',
        label: 'Travel',
        streamingChatId: null,
        onCancel: fn(),
        onConversationsDeleted: fn(),
        onDeleted: fn(),
    },
    play: async ({ canvasElement, userEvent, args }) => {
        const body = within(canvasElement.ownerDocument.body);

        await userEvent.click(body.getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(args.onDeleted).toHaveBeenCalledWith('group-1', []));
    },
};

export const DeletesGroupAndConversations = {
    args: {
        chatGroupId: 'group-2',
        label: 'Recipes',
        streamingChatId: null,
        onCancel: fn(),
        onConversationsDeleted: fn(),
        onDeleted: fn(),
    },
    play: async ({ canvasElement, userEvent, args }) => {
        const body = within(canvasElement.ownerDocument.body);

        await userEvent.click(body.getByRole('button', { name: 'Delete all' }));
        await waitFor(() => expect(args.onDeleted).toHaveBeenCalledWith('group-2', ['chat-1', 'chat-2']));
    },
};

export const RefusesWhileStreaming = {
    args: {
        chatGroupId: 'group-3',
        label: 'Work',
        streamingChatId: 'chat-1',
        onCancel: fn(),
        onConversationsDeleted: fn(),
        onDeleted: fn(),
    },
    play: async ({ canvasElement, userEvent }) => {
        const body = within(canvasElement.ownerDocument.body);

        await userEvent.click(body.getByRole('button', { name: 'Delete all' }));
        await waitFor(() => expect(body.getByRole('alert')).toHaveTextContent(/still responding/i));
    },
};
