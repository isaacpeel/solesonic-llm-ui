import { expect, fn, waitFor } from 'storybook/test';
import MessageGeneratedImages from './MessageGeneratedImages.jsx';

/* GeneratedImage fetches its bytes through imageGenerationService, mocked in msw-handlers.js. */
const meta = {
    component: MessageGeneratedImages,
    tags: ['ai-generated'],
};

export default meta;

export const SingleImage = {
    args: {
        images: [
            { imageId: 'img-1', prompt: 'a lighthouse at sunset', seed: 42, elapsedSeconds: 4.2 },
        ],
        onExpand: fn(),
    },
    play: async ({ canvasElement }) => {
        await waitFor(() => {
            const img = canvasElement.querySelector('.generated-image-picture');
            expect(img).toBeVisible();
        });
    },
};

export const MultipleImages = {
    args: {
        images: [
            { imageId: 'img-1', prompt: 'a lighthouse at sunset' },
            { imageId: 'img-2', prompt: 'a lighthouse at dawn' },
        ],
        onExpand: fn(),
    },
    play: async ({ canvasElement }) => {
        await waitFor(() => {
            expect(canvasElement.querySelectorAll('.generated-image-picture')).toHaveLength(2);
        });
    },
};
