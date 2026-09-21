import { expect, fn, waitFor } from 'storybook/test';
import GeneratedImage from './GeneratedImage.jsx';

/* Fetches its bytes through imageGenerationService, mocked in msw-handlers.js. */
const meta = {
    component: GeneratedImage,
    tags: ['ai-generated'],
};

export default meta;

export const WithMetadata = {
    args: {
        image: {
            imageId: 'img-1',
            prompt: 'a lighthouse at sunset, oil painting',
            seed: 918273645,
            width: 1024,
            height: 1024,
            steps: 30,
            elapsedSeconds: 4.8,
        },
        onExpand: fn(),
    },
    play: async ({ canvas, canvasElement, userEvent, args }) => {
        await waitFor(() => expect(canvasElement.querySelector('.generated-image-picture')).toBeVisible());

        await userEvent.click(canvas.getByRole('button', { name: 'Details' }));
        await expect(canvas.getByText('1024×1024')).toBeVisible();
        await expect(canvas.getByText('4.8s')).toBeVisible();

        await userEvent.click(canvas.getByRole('button', { name: 'Full size' }));
        await expect(args.onExpand).toHaveBeenCalledTimes(1);
    },
};

export const WithoutExpandAction = {
    args: {
        image: { imageId: 'img-2', prompt: 'a quiet mountain lake at dawn' },
    },
    play: async ({ canvas }) => {
        await expect(canvas.queryByRole('button', { name: 'Full size' })).not.toBeInTheDocument();
    },
};
