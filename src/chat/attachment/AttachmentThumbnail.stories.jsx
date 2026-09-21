import { expect, fn } from 'storybook/test';
import AttachmentThumbnail from './AttachmentThumbnail.jsx';

/* A tiny inline SVG so stories never hit the network for a thumbnail image. */
const PLACEHOLDER_IMAGE_URL = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="#4a4a4a"/></svg>'
);

const meta = {
    component: AttachmentThumbnail,
    tags: ['ai-generated'],
};

export default meta;

export const Image = {
    args: {
        objectUrl: PLACEHOLDER_IMAGE_URL,
        fileName: 'photo.png',
        contentType: 'image/png',
        onExpand: fn(),
        onRemove: fn(),
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByRole('button', { name: 'Expand photo.png' })).toBeVisible();
    },
};

export const Uploading = {
    args: {
        objectUrl: PLACEHOLDER_IMAGE_URL,
        fileName: 'photo.png',
        contentType: 'image/png',
        status: 'uploading',
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByRole('status', { name: 'Uploading photo.png' })).toBeVisible();
    },
};

export const Failed = {
    args: {
        objectUrl: PLACEHOLDER_IMAGE_URL,
        fileName: 'photo.png',
        contentType: 'image/png',
        status: 'failed',
        onRetry: fn(),
    },
    play: async ({ canvas, userEvent, args }) => {
        await userEvent.click(canvas.getByRole('button', { name: 'Retry uploading photo.png' }));
        await expect(args.onRetry).toHaveBeenCalledTimes(1);
    },
};

export const NonImageFile = {
    args: {
        fileName: 'quarterly-report.pdf',
        contentType: 'application/pdf',
        onRemove: fn(),
    },
};

export const Unavailable = {
    args: {
        fileName: 'old-attachment.png',
        unavailable: true,
    },
};
