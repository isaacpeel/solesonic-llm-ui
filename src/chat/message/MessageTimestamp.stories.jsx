import { expect } from 'storybook/test';
import MessageTimestamp from './MessageTimestamp.jsx';

/*
 * The preview's beforeEach pins MockDate to 2024-04-01T12:00:00Z; nowMilliseconds mirrors that
 * so the relative labels below are deterministic instead of drifting with the real clock.
 */
const NOW = new Date('2024-04-01T12:00:00Z').getTime();

const meta = {
    component: MessageTimestamp,
    tags: ['ai-generated'],
};

export default meta;

export const FiveMinutesAgo = {
    args: {
        timestamp: new Date('2024-04-01T11:55:00Z').toISOString(),
        nowMilliseconds: NOW,
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('5 minutes ago')).toBeVisible();
    },
};

export const JustNow = {
    args: {
        timestamp: new Date('2024-04-01T11:59:45Z').toISOString(),
        nowMilliseconds: NOW,
    },
};

export const InvalidTimestamp = {
    args: {
        timestamp: 'not-a-date',
        nowMilliseconds: NOW,
    },
};
