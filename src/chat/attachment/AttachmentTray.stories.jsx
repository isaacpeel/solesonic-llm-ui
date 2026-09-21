import { expect, fn } from 'storybook/test';
import AttachmentTray from './AttachmentTray.jsx';

const PLACEHOLDER_IMAGE_URL = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="#4a4a4a"/></svg>'
);

/* Entries carry localObjectUrl, which short-circuits useAttachmentUrl's network fetch entirely. */
const TRAY_ENTRIES = [
    { trayKey: 't1', fileName: 'photo.png', contentType: 'image/png', status: 'ready', localObjectUrl: PLACEHOLDER_IMAGE_URL, caption: '' },
    { trayKey: 't2', fileName: 'itinerary.pdf', contentType: 'application/pdf', status: 'uploading' },
    { trayKey: 't3', fileName: 'huge-photo.png', contentType: 'image/png', status: 'failed', localObjectUrl: PLACEHOLDER_IMAGE_URL, errorMessage: 'Upload failed. Try again.' },
];

const meta = {
    component: AttachmentTray,
    tags: ['ai-generated'],
};

export default meta;

export const MixedEntries = {
    args: {
        trayEntries: TRAY_ENTRIES,
        openCaptionTrayKey: null,
        onToggleCaption: fn(),
        onRemoveEntry: fn(),
        onRetryEntry: fn(),
    },
    play: async ({ canvas, userEvent, args }) => {
        await expect(canvas.getByText('itinerary.pdf')).toBeVisible();
        await expect(canvas.getByText('Upload failed. Try again.')).toBeVisible();

        await userEvent.click(canvas.getByRole('button', { name: 'Remove photo.png' }));
        await expect(args.onRemoveEntry).toHaveBeenCalledWith('t1');
    },
};

export const CaptionOpen = {
    args: {
        trayEntries: TRAY_ENTRIES,
        openCaptionTrayKey: 't1',
        onToggleCaption: fn(),
        onRemoveEntry: fn(),
        onRetryEntry: fn(),
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByRole('button', { name: 'Add a note to photo.png' })).toHaveAttribute('aria-expanded', 'true');
    },
};
