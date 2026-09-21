import { expect, fn, within } from 'storybook/test';
import ChatDropActionMenu from './ChatDropActionMenu.jsx';

/* Portalled to document.body, so it must be queried through canvasElement.ownerDocument. */
const meta = {
    component: ChatDropActionMenu,
    tags: ['ai-generated'],
};

export default meta;

export const Default = {
    args: {
        label: 'Weekend trip planning',
        point: { clientX: 200, clientY: 200 },
        groups: [
            { id: 'group-1', name: 'Travel' },
            { id: 'group-2', name: 'Recipes' },
        ],
        currentChatGroupId: null,
        onNewGroup: fn(),
        onMoveToGroup: fn(),
        onDelete: fn(),
        onDismiss: fn(),
    },
    play: async ({ canvasElement, userEvent, args }) => {
        const body = within(canvasElement.ownerDocument.body);

        await userEvent.selectOptions(body.getByLabelText('Move to'), 'group-2');
        await expect(args.onMoveToGroup).toHaveBeenCalledWith('group-2');
    },
};

export const CreatesNewGroup = {
    args: {
        label: 'Weekend trip planning',
        point: { clientX: 200, clientY: 200 },
        groups: [{ id: 'group-1', name: 'Travel' }],
        currentChatGroupId: null,
        onNewGroup: fn(),
        onMoveToGroup: fn(),
        onDelete: fn(),
        onDismiss: fn(),
    },
    play: async ({ canvasElement, userEvent, args }) => {
        const body = within(canvasElement.ownerDocument.body);

        await userEvent.selectOptions(body.getByLabelText('Move to'), 'new-group');
        await expect(args.onNewGroup).toHaveBeenCalledTimes(1);
    },
};

export const DeletesConversation = {
    args: {
        label: 'Weekend trip planning',
        point: { clientX: 200, clientY: 200 },
        groups: [],
        currentChatGroupId: null,
        onNewGroup: fn(),
        onMoveToGroup: fn(),
        onDelete: fn(),
        onDismiss: fn(),
    },
    play: async ({ canvasElement, userEvent, args }) => {
        const body = within(canvasElement.ownerDocument.body);

        await userEvent.click(body.getByRole('button', { name: 'Delete conversation' }));
        await expect(args.onDelete).toHaveBeenCalledTimes(1);
    },
};
