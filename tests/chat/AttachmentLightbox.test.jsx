import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import AttachmentLightbox from '../../src/chat/AttachmentLightbox.jsx';

function renderLightbox(overrides = {}, onClose = vi.fn()) {
    const attachment = {
        id: 'a1',
        fileName: 'screenshot.png',
        objectUrl: 'blob:resolved-1',
        ...overrides,
    };

    return {onClose, ...render(<AttachmentLightbox attachment={attachment} onClose={onClose}/>)};
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('AttachmentLightbox', () => {
    it('renders nothing without an attachment', () => {
        const {container} = render(<AttachmentLightbox attachment={null} onClose={vi.fn()}/>);

        expect(container.firstChild).toBeNull();
    });

    it('renders a modal dialog showing the image', () => {
        const {container} = renderLightbox();

        const dialog = container.querySelector('[role="dialog"]');
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(screen.getByAltText('screenshot.png').getAttribute('src')).toBe('blob:resolved-1');
    });

    it('reuses the already-resolved objectUrl rather than fetching again', () => {
        renderLightbox({objectUrl: 'blob:already-resolved'});

        expect(screen.getByAltText('screenshot.png').getAttribute('src')).toBe('blob:already-resolved');
    });

    it('labels the dialog and the image with the description when present', () => {
        const {container} = renderLightbox({description: 'the error banner'});

        expect(container.querySelector('[role="dialog"]').getAttribute('aria-label')).toBe('the error banner');
        expect(screen.getByAltText('the error banner')).toBeTruthy();
        expect(screen.getByText('the error banner')).toBeTruthy();
    });

    it('closes on Escape', () => {
        const {onClose} = renderLightbox();

        fireEvent.keyDown(document, {key: 'Escape'});

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on a backdrop click', () => {
        const {onClose, container} = renderLightbox();

        fireEvent.click(container.querySelector('.attachment-lightbox-backdrop'));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close when the image itself is clicked', () => {
        const {onClose} = renderLightbox();

        fireEvent.click(screen.getByAltText('screenshot.png'));

        expect(onClose).not.toHaveBeenCalled();
    });

    it('closes from the close button', () => {
        const {onClose} = renderLightbox();

        fireEvent.click(screen.getByLabelText('Close image'));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('focuses the close button on open and traps Tab there', () => {
        renderLightbox();

        const closeButton = screen.getByLabelText('Close image');
        expect(document.activeElement).toBe(closeButton);

        fireEvent.keyDown(document, {key: 'Tab'});
        expect(document.activeElement).toBe(closeButton);
    });

    it('stops listening for Escape once unmounted', () => {
        const {onClose, unmount} = renderLightbox();

        unmount();
        fireEvent.keyDown(document, {key: 'Escape'});

        expect(onClose).not.toHaveBeenCalled();
    });
});
