import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';

vi.mock('../../src/hooks/useAttachmentUrl.js', () => ({
    default: vi.fn(),
}));

import MessageAttachments from '../../src/chat/attachment/MessageAttachments.jsx';
import useAttachmentUrl from '../../src/hooks/useAttachmentUrl.js';

function resolved(objectUrl) {
    return {objectUrl, loading: false, error: null};
}

beforeEach(() => {
    useAttachmentUrl.mockReturnValue(resolved('blob:resolved-1'));
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('MessageAttachments', () => {
    it('renders nothing for an empty array', () => {
        const {container} = render(<MessageAttachments attachments={[]}/>);

        expect(container.firstChild).toBeNull();
    });

    it('renders nothing for null', () => {
        const {container} = render(<MessageAttachments attachments={null}/>);

        expect(container.firstChild).toBeNull();
    });

    it('renders one thumbnail per attachment', () => {
        const {container} = render(
            <MessageAttachments attachments={[{id: 'a1', fileName: 'one.png'}, {id: 'a2', fileName: 'two.png'}]}/>
        );

        expect(container.querySelectorAll('.attachment-thumbnail')).toHaveLength(2);
    });

    it('prefers description over fileName for alt text', () => {
        render(<MessageAttachments attachments={[{id: 'a1', fileName: 'one.png', description: 'the error banner'}]}/>);

        expect(screen.getByAltText('the error banner')).toBeTruthy();
    });

    it('falls back to fileName when there is no description', () => {
        render(<MessageAttachments attachments={[{id: 'a1', fileName: 'one.png'}]}/>);

        expect(screen.getByAltText('one.png')).toBeTruthy();
    });

    it('passes a localObjectUrl through so an optimistic bubble never fetches', () => {
        render(<MessageAttachments attachments={[{id: 'a1', fileName: 'one.png', localObjectUrl: 'blob:local-1'}]}/>);

        expect(useAttachmentUrl).toHaveBeenCalledWith('a1', {localObjectUrl: 'blob:local-1'});
    });

    it('renders the unavailable tile rather than a broken image on a 404', () => {
        useAttachmentUrl.mockReturnValue({objectUrl: null, loading: false, error: 'missing'});

        const {container} = render(<MessageAttachments attachments={[{id: 'a1', fileName: 'gone.png'}]}/>);

        expect(container.querySelector('.attachment-thumbnail--unavailable')).toBeTruthy();
        expect(container.querySelector('img')).toBeNull();
        expect(screen.getByText('Image no longer available')).toBeTruthy();
    });

    it('calls onExpand with the attachment and its resolved URL', () => {
        const onExpand = vi.fn();
        render(
            <MessageAttachments
                attachments={[{id: 'a1', fileName: 'one.png', description: 'banner'}]}
                onExpand={onExpand}
            />
        );

        fireEvent.click(screen.getByLabelText('Expand one.png'));

        expect(onExpand).toHaveBeenCalledWith({
            id: 'a1',
            fileName: 'one.png',
            description: 'banner',
            objectUrl: 'blob:resolved-1',
        });
    });

    it('offers no expand control without an onExpand handler', () => {
        render(<MessageAttachments attachments={[{id: 'a1', fileName: 'one.png'}]}/>);

        expect(screen.queryByLabelText('Expand one.png')).toBeNull();
    });

    it('never offers a remove control on a sent message', () => {
        render(<MessageAttachments attachments={[{id: 'a1', fileName: 'one.png'}]}/>);

        expect(screen.queryByLabelText('Remove one.png')).toBeNull();
    });

    it('renders a document attachment as a file icon rather than an image', () => {
        const {container} = render(
            <MessageAttachments attachments={[{id: 'a1', fileName: 'notes.pdf', contentType: 'application/pdf'}]}/>
        );

        expect(container.querySelector('.attachment-thumbnail-file')).toBeTruthy();
        expect(container.querySelector('img')).toBeNull();
    });

    it('infers a document attachment from its file name when no content type is given', () => {
        const {container} = render(<MessageAttachments attachments={[{id: 'a1', fileName: 'notes.pdf'}]}/>);

        expect(container.querySelector('.attachment-thumbnail-file')).toBeTruthy();
    });

    it('offers no expand control for a document attachment even with an onExpand handler', () => {
        const onExpand = vi.fn();
        render(
            <MessageAttachments
                attachments={[{id: 'a1', fileName: 'notes.pdf', contentType: 'application/pdf'}]}
                onExpand={onExpand}
            />
        );

        expect(screen.queryByLabelText('Expand notes.pdf')).toBeNull();
    });

    it('warns with the mapped text when an image failed to describe', () => {
        const {container} = render(
            <MessageAttachments attachments={[{id: 'a1', fileName: 'one.png', described: false, reason: 'VISION_UNAVAILABLE'}]}/>
        );

        expect(screen.getByTitle('The image reader is unavailable, so the assistant could not see this image.')).toBeTruthy();
        expect(container.querySelector('.attachment-thumbnail-notice--warning')).toBeTruthy();
        expect(screen.queryByTitle('VISION_UNAVAILABLE')).toBeNull();
    });

    it('shows no notice when described is false without a reason, since that image was never attempted', () => {
        const {container} = render(<MessageAttachments attachments={[{id: 'a1', fileName: 'one.png', described: false}]}/>);

        expect(container.querySelector('.attachment-thumbnail-notice')).toBeNull();
    });

    it('shows a neutral info notice, not a warning, for an image the tool did not need read', () => {
        const {container} = render(
            <MessageAttachments attachments={[{id: 'a1', fileName: 'one.png', described: false, reason: 'NOT_NEEDED'}]}/>
        );

        expect(container.querySelector('.attachment-thumbnail-notice--info')).toBeTruthy();
        expect(container.querySelector('.attachment-thumbnail-notice--warning')).toBeNull();
        expect(screen.getByTitle('Sent to the image tool as is. The assistant did not need to read it.')).toBeTruthy();
    });

    it('reads the history field name for a reloaded image', () => {
        render(
            <MessageAttachments attachments={[{id: 'a1', fileName: 'one.png', described: false, descriptionFailureReason: 'NOT_NEEDED'}]}/>
        );

        expect(screen.getByTitle('Sent to the image tool as is. The assistant did not need to read it.')).toBeTruthy();
    });

    it('warns with the mapped text when a document failed to index', () => {
        const {container} = render(
            <MessageAttachments
                attachments={[{id: 'a1', fileName: 'notes.pdf', contentType: 'application/pdf', indexed: false, extractionReason: 'DOCUMENT_UNREADABLE'}]}
            />
        );

        expect(screen.getByTitle('This document could not be read. It may be encrypted, corrupt, or scanned.')).toBeTruthy();
        expect(container.querySelector('.attachment-thumbnail-notice--warning')).toBeTruthy();
    });

    it('shows no image warning on a reloaded document that indexed fine', () => {
        const {container} = render(
            <MessageAttachments
                attachments={[{id: 'a1', fileName: 'notes.pdf', described: false, descriptionFailureReason: null, indexed: true}]}
            />
        );

        expect(container.querySelector('.attachment-thumbnail-notice')).toBeNull();
    });

    it('shows no notice once described and indexed are confirmed true', () => {
        const {container} = render(
            <MessageAttachments attachments={[{id: 'a1', fileName: 'one.png', described: true}]}/>
        );

        expect(container.querySelector('.attachment-thumbnail-notice')).toBeNull();
    });

    it('shows no notice while described/indexed are still undefined', () => {
        const {container} = render(<MessageAttachments attachments={[{id: 'a1', fileName: 'one.png'}]}/>);

        expect(container.querySelector('.attachment-thumbnail-notice')).toBeNull();
    });
});
