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
});
