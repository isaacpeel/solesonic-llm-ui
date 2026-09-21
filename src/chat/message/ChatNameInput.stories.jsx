import { expect, fn } from 'storybook/test';
import ChatNameInput from './ChatNameInput.jsx';

const meta = {
    component: ChatNameInput,
    tags: ['ai-generated'],
};

export default meta;

export const CommitsOnEnter = {
    args: {
        className: 'chat-name-input',
        label: 'Rename conversation',
        initialValue: 'Weekend trip planning',
        placeholder: 'Conversation name',
        onCommit: fn(),
        onCancel: fn(),
    },
    play: async ({ canvas, userEvent, args }) => {
        const input = canvas.getByLabelText('Rename conversation');
        await userEvent.clear(input);
        await userEvent.type(input, 'Ski trip', { delay: 10 });
        await userEvent.keyboard('{Enter}');

        await expect(args.onCommit).toHaveBeenCalledWith('Ski trip');
    },
};

export const CancelsOnEscape = {
    args: {
        className: 'chat-name-input',
        label: 'Rename conversation',
        initialValue: 'Old trip name',
        placeholder: 'Conversation name',
        onCommit: fn(),
        onCancel: fn(),
    },
    play: async ({ canvas, userEvent, args }) => {
        const input = canvas.getByLabelText('Rename conversation');
        await userEvent.type(input, ' extra', { delay: 10 });
        await userEvent.keyboard('{Escape}');

        await expect(args.onCancel).toHaveBeenCalledTimes(1);
        await expect(args.onCommit).not.toHaveBeenCalled();
    },
};
