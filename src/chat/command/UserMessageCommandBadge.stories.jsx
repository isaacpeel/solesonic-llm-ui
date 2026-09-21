import { expect } from 'storybook/test';
import UserMessageCommandBadge from './UserMessageCommandBadge.jsx';

const meta = {
    component: UserMessageCommandBadge,
    tags: ['ai-generated'],
};

export default meta;

export const Default = {
    args: {
        command: 'summarize',
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('/summarize')).toBeVisible();
    },
};
