import { expect, fn } from 'storybook/test';
import SlashCommandList from './SlashCommandList.jsx';

const CANDIDATES = [
    { command: 'help', description: 'Show available commands' },
    { command: 'reset', description: 'Reset the conversation' },
    { command: 'summarize', description: 'Summarize the conversation so far' },
];

const meta = {
    component: SlashCommandList,
    tags: ['ai-generated'],
};

export default meta;

export const FirstSelected = {
    args: {
        commandCandidates: CANDIDATES,
        selectedIndex: 0,
        onCommandSelect: fn(),
    },
    play: async ({ canvas, userEvent, args }) => {
        const options = canvas.getAllByRole('option');
        await expect(options[0]).toHaveAttribute('aria-selected', 'true');
        await expect(options[1]).toHaveAttribute('aria-selected', 'false');

        await userEvent.click(canvas.getByText('/reset'));
        await expect(args.onCommandSelect).toHaveBeenCalledWith(CANDIDATES[1]);
    },
};

export const LastSelected = {
    args: {
        commandCandidates: CANDIDATES,
        selectedIndex: 2,
        onCommandSelect: fn(),
    },
};
