import { expect, fn } from 'storybook/test';
import ElicitationPrompt from './ElicitationPrompt.jsx';

const meta = {
    component: ElicitationPrompt,
    tags: ['ai-generated'],
};

export default meta;

/*
 * An empty `properties: {}` schema is what the server sends for a plain confirmation — the
 * component fills in the default accept/cancel/decline action itself.
 */
export const ConfirmationActions = {
    args: {
        elicitation: {
            message: 'Proceed with deployment?',
            requestedSchema: { properties: {} },
        },
        values: {},
        onChange: fn(),
        onSubmit: fn(),
        submitting: false,
    },
    play: async ({ canvas, userEvent, args }) => {
        await userEvent.click(canvas.getByRole('button', { name: 'Accept' }));
        await expect(args.onChange).toHaveBeenCalledWith('action', 'accept');
        await expect(args.onSubmit).toHaveBeenCalledWith({ action: 'accept' });
    },
};

export const TextField = {
    args: {
        elicitation: {
            message: 'One more thing before we continue.',
            requestedSchema: {
                properties: {
                    reason: {
                        type: 'string',
                        title: 'Reason',
                        description: 'Provide a brief reason',
                    },
                },
            },
        },
        values: { reason: '' },
        onChange: fn(),
        onSubmit: fn(),
        submitting: false,
    },
    play: async ({ canvas, userEvent, args }) => {
        const input = canvas.getByPlaceholderText('Provide a brief reason');
        await userEvent.type(input, 'Needs another review', { delay: 10 });
        await expect(args.onChange).toHaveBeenCalled();
        await expect(args.onChange.mock.calls[0][0]).toBe('reason');

        await userEvent.click(canvas.getByRole('button', { name: 'Submit' }));
        await expect(args.onSubmit).toHaveBeenCalledTimes(1);
    },
};

export const Submitting = {
    args: {
        elicitation: {
            message: 'One more thing before we continue.',
            requestedSchema: {
                properties: {
                    reason: { type: 'string', title: 'Reason', description: 'Provide a brief reason' },
                },
            },
        },
        values: { reason: 'Needs another review' },
        onChange: fn(),
        onSubmit: fn(),
        submitting: true,
    },
};
