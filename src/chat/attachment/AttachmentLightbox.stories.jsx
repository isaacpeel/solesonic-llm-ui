import { expect, fn } from 'storybook/test';
import AttachmentLightbox from './AttachmentLightbox.jsx';

const PLACEHOLDER_IMAGE_URL = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#2c2c2c"/></svg>'
);

const meta = {
    component: AttachmentLightbox,
    tags: ['ai-generated'],
};

export default meta;

export const Default = {
    args: {
        attachment: {
            objectUrl: PLACEHOLDER_IMAGE_URL,
            fileName: 'sunset.png',
            description: 'A photo of the sunset over the bay',
        },
        onClose: fn(),
    },
    play: async ({ canvas, userEvent, args }) => {
        await expect(canvas.getByRole('dialog', { name: 'A photo of the sunset over the bay' })).toBeVisible();

        await userEvent.click(canvas.getByRole('button', { name: 'Close image' }));
        await expect(args.onClose).toHaveBeenCalledTimes(1);
    },
};

export const ClosesOnEscape = {
    args: {
        attachment: {
            objectUrl: PLACEHOLDER_IMAGE_URL,
            fileName: 'sunset.png',
        },
        onClose: fn(),
    },
    play: async ({ userEvent, args }) => {
        await userEvent.keyboard('{Escape}');
        await expect(args.onClose).toHaveBeenCalledTimes(1);
    },
};
