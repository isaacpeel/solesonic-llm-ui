import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import ComposerAttachments from '../../src/chat/ComposerAttachments.jsx';

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

function renderComposer(props = {}) {
    return render(
        <ComposerAttachments
            trayEntries={props.trayEntries ?? []}
            addFiles={props.addFiles ?? vi.fn()}
            removeEntry={props.removeEntry ?? vi.fn()}
            retryEntry={props.retryEntry ?? vi.fn()}
            setEntryCaption={props.setEntryCaption ?? vi.fn()}
            trayError={props.trayError ?? null}
            loading={props.loading ?? false}
            onCaptionOpenChange={props.onCaptionOpenChange}
        >
            <textarea data-testid="chat-textarea"/>
        </ComposerAttachments>
    );
}

beforeEach(() => {
    vi.stubGlobal('URL', {createObjectURL: vi.fn(), revokeObjectURL: vi.fn()});
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('ComposerAttachments', () => {
    it('renders children untouched with an empty tray', () => {
        const {container} = renderComposer();

        expect(screen.getByTestId('chat-textarea')).toBeTruthy();
        expect(container.querySelector('.composer-attachment-tray')).toBeNull();
        expect(container.querySelector('.chat-input-row')).toBeTruthy();
    });

    it('wraps children in the input row so the loader does not center on the tray', () => {
        const {container} = renderComposer({trayEntries: [trayEntry()]});

        const inputRow = container.querySelector('.chat-input-row');
        expect(inputRow.querySelector('[data-testid="chat-textarea"]')).toBeTruthy();
        expect(container.querySelector('.composer-attachment-tray')).toBeTruthy();
    });

    it('calls addFiles when an accepted image is dropped', () => {
        const addFiles = vi.fn();
        const {container} = renderComposer({addFiles});
        const droppedFiles = [{name: 'a.png', type: 'image/png', size: 10}];

        fireEvent.drop(container.querySelector('.composer-attachments'), {
            dataTransfer: {files: droppedFiles},
        });

        expect(addFiles).toHaveBeenCalledWith(droppedFiles);
    });

    it('does not call addFiles on drop while loading', () => {
        const addFiles = vi.fn();
        const {container} = renderComposer({addFiles, loading: true});

        fireEvent.drop(container.querySelector('.composer-attachments'), {
            dataTransfer: {files: [{name: 'a.png', type: 'image/png', size: 10}]},
        });

        expect(addFiles).not.toHaveBeenCalled();
    });

    it('marks the drop zone during a drag and clears it on leave', () => {
        const {container} = renderComposer();
        const dropZone = container.querySelector('.composer-attachments');

        fireEvent.dragEnter(dropZone, {dataTransfer: {files: []}});
        expect(dropZone.className).toContain('composer-attachments--drag-over');

        fireEvent.dragLeave(dropZone, {dataTransfer: {files: []}});
        expect(dropZone.className).not.toContain('composer-attachments--drag-over');
    });

    it('prevents the default dragover so the browser does not open the file', () => {
        const {container} = renderComposer();

        const dragOverEvent = new Event('dragover', {bubbles: true, cancelable: true});
        container.querySelector('.composer-attachments').dispatchEvent(dragOverEvent);

        expect(dragOverEvent.defaultPrevented).toBe(true);
    });

    it('disables the attach button while loading', () => {
        renderComposer({loading: true});

        expect(screen.getByLabelText('Attach an image').disabled).toBe(true);
    });

    it('disables the attach button at the cap', () => {
        renderComposer({
            trayEntries: [
                trayEntry({trayKey: 'a'}),
                trayEntry({trayKey: 'b'}),
                trayEntry({trayKey: 'c'}),
                trayEntry({trayKey: 'd'}),
            ],
        });

        expect(screen.getByLabelText('Attachment limit of 4 images reached').disabled).toBe(true);
    });

    it('opens a single caption input for the toggled entry and reports the state upward', () => {
        const setEntryCaption = vi.fn();
        const onCaptionOpenChange = vi.fn();
        const {container} = renderComposer({
            trayEntries: [trayEntry(), trayEntry({trayKey: 'tray-2', fileName: 'second.png'})],
            setEntryCaption,
            onCaptionOpenChange,
        });

        expect(onCaptionOpenChange).toHaveBeenLastCalledWith(false);

        fireEvent.click(screen.getByLabelText('Add a note to screenshot.png'));

        const captionInputs = container.querySelectorAll('.composer-attachment-caption-input');
        expect(captionInputs).toHaveLength(1);
        expect(screen.getByText('screenshot.png')).toBeTruthy();
        expect(onCaptionOpenChange).toHaveBeenLastCalledWith(true);

        fireEvent.change(captionInputs[0], {target: {value: 'the error banner'}});
        expect(setEntryCaption).toHaveBeenCalledWith('tray-1', 'the error banner');
    });

    it('closes the caption row when its entry is removed', () => {
        const removeEntry = vi.fn();
        const {container} = renderComposer({trayEntries: [trayEntry()], removeEntry});

        fireEvent.click(screen.getByLabelText('Add a note to screenshot.png'));
        expect(container.querySelector('.composer-attachment-caption-input')).toBeTruthy();

        fireEvent.click(screen.getByLabelText('Remove screenshot.png'));

        expect(removeEntry).toHaveBeenCalledWith('tray-1');
        expect(container.querySelector('.composer-attachment-caption-input')).toBeNull();
    });

    it('surfaces a tray error in a status region', () => {
        const {container} = renderComposer({trayError: 'Images must be under 20MB'});

        const errorNode = container.querySelector('.composer-attachment-tray-error');
        expect(errorNode.textContent).toBe('Images must be under 20MB');
        expect(errorNode.getAttribute('role')).toBe('status');
    });
});
