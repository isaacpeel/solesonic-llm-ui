import { expect, fn } from 'storybook/test';
import SelectedCommandChip from './SelectedCommandChip.jsx';

const SELECTED_COMMAND = { command: 'summarize', description: 'Summarize the conversation so far' };

const meta = {
    component: SelectedCommandChip,
    tags: ['ai-generated'],
};

export default meta;

export const Unpinned = {
    args: {
        selectedCommand: SELECTED_COMMAND,
        isPinned: false,
        onTogglePin: fn(),
        onDeselect: fn(),
    },
    play: async ({ canvas, userEvent, args }) => {
        await expect(canvas.getByRole('button', { name: 'Pin command to conversation' })).toBeVisible();

        await userEvent.click(canvas.getByRole('button', { name: 'Pin command to conversation' }));
        await expect(args.onTogglePin).toHaveBeenCalledTimes(1);
    },
};

export const Pinned = {
    args: {
        selectedCommand: SELECTED_COMMAND,
        isPinned: true,
        onTogglePin: fn(),
        onDeselect: fn(),
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByRole('button', { name: 'Unpin command' })).toBeVisible();
    },
};

/*
 * .selected-command-chip sets background-color: var(--secondary-color), which resolves to
 * #3a3a3a (rgb(58, 58, 58)) from the :root block in main.css. A wrong or missing computed value
 * means the shared preview failed to load the app's global stylesheet.
 */
export const CssCheck = {
    args: {
        selectedCommand: SELECTED_COMMAND,
        isPinned: false,
        onTogglePin: fn(),
        onDeselect: fn(),
    },
    play: async ({ canvasElement }) => {
        const chip = canvasElement.querySelector('.selected-command-chip');
        await expect(getComputedStyle(chip).backgroundColor).toBe('rgb(58, 58, 58)');
    },
};
