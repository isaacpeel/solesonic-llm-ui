import { expect, fn } from 'storybook/test';
import MessageAttachments from './MessageAttachments.jsx';

const PLACEHOLDER_IMAGE_URL = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="#4a4a4a"/></svg>'
);

const meta = {
    component: MessageAttachments,
    tags: ['ai-generated'],
};

export default meta;

export const Attached = {
    args: {
        attachments: [
            { id: 'a1', fileName: 'receipt.png', contentType: 'image/png', localObjectUrl: PLACEHOLDER_IMAGE_URL },
        ],
        onExpand: fn(),
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByRole('button', { name: 'Expand receipt.png' })).toBeVisible();
    },
};

/* `described: false` is the backend explicitly reporting a failed vision pass on this image. */
export const VisionWarning = {
    args: {
        attachments: [
            { id: 'a2', fileName: 'diagram.png', contentType: 'image/png', localObjectUrl: PLACEHOLDER_IMAGE_URL, described: false },
        ],
        onExpand: fn(),
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByLabelText('The assistant may not have been able to read this image.')).toBeVisible();
    },
};

export const MultipleAttachments = {
    args: {
        attachments: [
            { id: 'a1', fileName: 'receipt.png', contentType: 'image/png', localObjectUrl: PLACEHOLDER_IMAGE_URL },
            { id: 'a2', fileName: 'notes.txt', contentType: 'text/plain' },
        ],
        onExpand: fn(),
    },
};
