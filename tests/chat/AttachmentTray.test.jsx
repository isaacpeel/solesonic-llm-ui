import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import AttachmentTray from '../../src/chat/attachment/AttachmentTray.jsx';

function trayEntry(overrides = {}) {
    return {
        trayKey: 'tray-1',
        fileName: 'screenshot.png',
        localObjectUrl: 'blob:object-url-1',
        caption: '',
        status: 'ready',
        warning: null,
        errorMessage: null,
        ...overrides,
    };
}

function renderTray(trayEntries, handlers = {}) {
    return render(
        <AttachmentTray
            trayEntries={trayEntries}
            openCaptionTrayKey={handlers.openCaptionTrayKey ?? null}
            onToggleCaption={handlers.onToggleCaption ?? vi.fn()}
            onRemoveEntry={handlers.onRemoveEntry ?? vi.fn()}
            onRetryEntry={handlers.onRetryEntry ?? vi.fn()}
        />
    );
}

describe('AttachmentTray', () => {
    it('renders nothing when the tray is empty', () => {
        const {container} = renderTray([]);

        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when trayEntries is not an array', () => {
        const {container} = renderTray(undefined);

        expect(container.firstChild).toBeNull();
    });

    it('renders one thumbnail per entry', () => {
        const {container} = renderTray([
            trayEntry(),
            trayEntry({trayKey: 'tray-2', fileName: 'second.png'}),
        ]);

        expect(container.querySelectorAll('.attachment-thumbnail')).toHaveLength(2);
    });

    it('exposes the remove button by an aria-label naming the file', () => {
        const onRemoveEntry = vi.fn();
        renderTray([trayEntry()], {onRemoveEntry});

        fireEvent.click(screen.getByLabelText('Remove screenshot.png'));

        expect(onRemoveEntry).toHaveBeenCalledWith('tray-1');
    });

    it('offers a note toggle for a ready entry and reports the toggle', () => {
        const onToggleCaption = vi.fn();
        renderTray([trayEntry()], {onToggleCaption});

        fireEvent.click(screen.getByLabelText('Add a note to screenshot.png'));

        expect(onToggleCaption).toHaveBeenCalledWith('tray-1');
    });

    it('hides the note toggle while an entry is still uploading', () => {
        renderTray([trayEntry({status: 'uploading'})]);

        expect(screen.queryByLabelText('Add a note to screenshot.png')).toBeNull();
    });

    it('offers a retry button for a failed entry', () => {
        const onRetryEntry = vi.fn();
        renderTray([trayEntry({status: 'failed', errorMessage: 'Upload failed — tap to retry'})], {onRetryEntry});

        fireEvent.click(screen.getByLabelText('Retry uploading screenshot.png'));

        expect(onRetryEntry).toHaveBeenCalledWith('tray-1');
    });

    it('shows the per-entry error message', () => {
        const {container} = renderTray([trayEntry({status: 'failed', errorMessage: 'That image type is not supported'})]);

        expect(container.querySelector('.composer-attachment-error').textContent)
            .toBe('That image type is not supported');
    });

    it('marks the note toggle as expanded for the open entry', () => {
        renderTray([trayEntry()], {openCaptionTrayKey: 'tray-1'});

        expect(screen.getByLabelText('Add a note to screenshot.png').getAttribute('aria-expanded')).toBe('true');
    });
});
