import { expect } from 'storybook/test';
import MessageResponseMetadata from './MessageResponseMetadata.jsx';

const meta = {
    component: MessageResponseMetadata,
    tags: ['ai-generated'],
};

export default meta;

export const FullMetadata = {
    args: {
        responseMetadata: { promptTokens: 120, totalTokens: 180, promptMillis: 850 },
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByText(/tok:180/)).toBeVisible();
        await expect(canvas.getByText(/tok\/s/)).toBeVisible();
    },
};

export const LongDuration = {
    args: {
        responseMetadata: { promptTokens: 500, totalTokens: 2500, promptMillis: 6200 },
    },
};

export const NoMetadata = {
    args: {
        responseMetadata: null,
    },
};
