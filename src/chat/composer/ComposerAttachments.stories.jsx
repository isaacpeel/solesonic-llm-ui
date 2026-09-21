import { expect, fn } from 'storybook/test';
import ComposerAttachments from './ComposerAttachments.jsx';

const PLACEHOLDER_IMAGE_URL = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="#4a4a4a"/></svg>'
);

const meta = {
    component: ComposerAttachments,
    tags: ['ai-generated'],
};

export default meta;

export const Empty = {
    args: {
        trayEntries: [],
        addFiles: fn(),
        removeEntry: fn(),
        retryEntry: fn(),
        setEntryCaption: fn(),
        trayError: null,
        loading: false,
        onCaptionOpenChange: fn(),
        children: <textarea placeholder="Message the assistant…" />,
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByPlaceholderText('Message the assistant…')).toBeVisible();
        await expect(canvas.getByRole('button', { name: 'Attach a file' })).toBeVisible();
    },
};

export const WithAttachment = {
    args: {
        trayEntries: [
            { trayKey: 't1', fileName: 'photo.png', contentType: 'image/png', status: 'ready', localObjectUrl: PLACEHOLDER_IMAGE_URL, caption: '' },
        ],
        addFiles: fn(),
        removeEntry: fn(),
        retryEntry: fn(),
        setEntryCaption: fn(),
        trayError: null,
        loading: false,
        onCaptionOpenChange: fn(),
        children: <textarea placeholder="Message the assistant…" />,
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('photo.png')).toBeVisible();
    },
};

export const CaptionRowOpen = {
    args: {
        trayEntries: [
            { trayKey: 't1', fileName: 'photo.png', contentType: 'image/png', status: 'ready', localObjectUrl: PLACEHOLDER_IMAGE_URL, caption: '' },
        ],
        addFiles: fn(),
        removeEntry: fn(),
        retryEntry: fn(),
        setEntryCaption: fn(),
        trayError: null,
        loading: false,
        onCaptionOpenChange: fn(),
        children: <textarea placeholder="Message the assistant…" />,
    },
    play: async ({ canvas, userEvent, args }) => {
        await userEvent.click(canvas.getByRole('button', { name: 'Add a note to photo.png' }));

        const captionInput = canvas.getByPlaceholderText('What should the assistant look for?');
        await userEvent.type(captionInput, 'Focus on the text', { delay: 10 });

        await expect(args.setEntryCaption).toHaveBeenCalled();
        await expect(args.onCaptionOpenChange).toHaveBeenCalledWith(true);
    },
};

export const AtAttachmentLimit = {
    args: {
        trayEntries: Array.from({ length: 4 }, (_, index) => ({
            trayKey: `t${index}`,
            fileName: `photo-${index}.png`,
            contentType: 'image/png',
            status: 'ready',
            localObjectUrl: PLACEHOLDER_IMAGE_URL,
            caption: '',
        })),
        addFiles: fn(),
        removeEntry: fn(),
        retryEntry: fn(),
        setEntryCaption: fn(),
        trayError: null,
        loading: false,
        onCaptionOpenChange: fn(),
        children: <textarea placeholder="Message the assistant…" />,
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByRole('button', { name: 'Attachment limit of 4 files reached' })).toBeDisabled();
    },
};
