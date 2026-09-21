import { expect, fn, within } from 'storybook/test';
import ChatRowMenu from './ChatRowMenu.jsx';

/* The menu panel is portalled to document.body, so it must be queried through canvasElement.ownerDocument. */
const meta = {
    component: ChatRowMenu,
    tags: ['ai-generated'],
};

export default meta;

export const Default = {
    args: {
        label: 'Weekend trip planning',
        actions: [
            { key: 'rename', label: 'Rename', onSelect: fn() },
            { key: 'delete', label: 'Delete', destructive: true, separatorBefore: true, onSelect: fn() },
        ],
    },
    play: async ({ canvasElement, canvas, userEvent, args }) => {
        const body = within(canvasElement.ownerDocument.body);

        await userEvent.click(canvas.getByRole('button', { name: 'Actions for Weekend trip planning' }));
        await expect(body.getByRole('menu')).toBeVisible();

        await userEvent.click(body.getByRole('menuitem', { name: 'Rename' }));
        await expect(args.actions[0].onSelect).toHaveBeenCalledTimes(1);
        await expect(body.queryByRole('menu')).not.toBeInTheDocument();
    },
};

export const DisabledAction = {
    args: {
        label: 'Active conversation',
        actions: [
            {
                key: 'delete',
                label: 'Delete',
                destructive: true,
                disabled: true,
                disabledReason: 'Wait for the response to finish.',
                onSelect: fn(),
            },
        ],
    },
    play: async ({ canvasElement, canvas, userEvent }) => {
        const body = within(canvasElement.ownerDocument.body);

        await userEvent.click(canvas.getByRole('button', { name: 'Actions for Active conversation' }));
        await expect(body.getByRole('menuitem', { name: 'Delete' })).toBeDisabled();
    },
};
