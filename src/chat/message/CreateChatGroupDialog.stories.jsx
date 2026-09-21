import { expect, fn, waitFor, within } from 'storybook/test';
import CreateChatGroupDialog from './CreateChatGroupDialog.jsx';

/* Portalled to document.body; chatGroupService.createGroup is mocked in msw-handlers.js. */
const meta = {
    component: CreateChatGroupDialog,
    tags: ['ai-generated'],
};

export default meta;

export const BlankNameDisablesCreate = {
    args: {
        onCancel: fn(),
        onCreated: fn(),
    },
    play: async ({ canvasElement }) => {
        const body = within(canvasElement.ownerDocument.body);
        await expect(body.getByRole('button', { name: 'Create' })).toBeDisabled();
    },
};

export const CreatesGroup = {
    args: {
        onCancel: fn(),
        onCreated: fn(),
    },
    play: async ({ canvasElement, userEvent, args }) => {
        const body = within(canvasElement.ownerDocument.body);

        await userEvent.type(body.getByLabelText('Group name'), 'Travel', { delay: 10 });
        await userEvent.click(body.getByRole('button', { name: 'Create' }));

        await waitFor(() => expect(args.onCreated).toHaveBeenCalledWith({ id: 'group-new', name: 'Travel' }));
    },
};
