import {useEffect, useRef, useState} from 'react';
import {PaperClipIcon} from '@heroicons/react/20/solid';
import AttachmentTray from './AttachmentTray.jsx';
import {ACCEPTED_IMAGE_ACCEPT_ATTRIBUTE, MAX_ATTACHMENTS_PER_MESSAGE} from '../util/imageValidation.js';
import './ComposerAttachments.css';

function ComposerAttachments({
    trayEntries,
    addFiles,
    removeEntry,
    retryEntry,
    setEntryCaption,
    trayError,
    loading,
    onCaptionOpenChange,
    children,
}) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [openCaptionTrayKey, setOpenCaptionTrayKey] = useState(null);
    const fileInputRef = useRef(null);
    const dragDepthRef = useRef(0);

    const entries = Array.isArray(trayEntries) ? trayEntries : [];
    const isAtCap = entries.length >= MAX_ATTACHMENTS_PER_MESSAGE;
    const openCaptionEntry = entries.find((entry) => entry.trayKey === openCaptionTrayKey) || null;
    const isCaptionRowOpen = !!openCaptionEntry;

    /* The composer clearance in ChatScreen.css depends on this row being rendered. */
    useEffect(() => {
        onCaptionOpenChange?.(isCaptionRowOpen);
    }, [isCaptionRowOpen, onCaptionOpenChange]);

    const handleDragEnter = (event) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        setIsDragOver(true);
    };

    const handleDragOver = (event) => {
        event.preventDefault();
    };

    const handleDragLeave = (event) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

        if (dragDepthRef.current === 0) {
            setIsDragOver(false);
        }
    };

    const handleDrop = (event) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setIsDragOver(false);

        if (loading) {
            return;
        }

        const droppedFiles = event.dataTransfer?.files;

        if (droppedFiles && droppedFiles.length > 0) {
            addFiles(droppedFiles);
        }
    };

    const handleFileInputChange = (event) => {
        const selectedFiles = event.target.files;

        if (selectedFiles && selectedFiles.length > 0) {
            addFiles(selectedFiles);
        }

        event.target.value = '';
    };

    const handleToggleCaption = (trayKey) => {
        setOpenCaptionTrayKey((currentTrayKey) => (currentTrayKey === trayKey ? null : trayKey));
    };

    const handleRemoveEntry = (trayKey) => {
        if (openCaptionTrayKey === trayKey) {
            setOpenCaptionTrayKey(null);
        }

        removeEntry(trayKey);
    };

    return (
        <>
            <div
                className={`composer-attachments${isDragOver ? ' composer-attachments--drag-over' : ''}`}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <AttachmentTray
                    trayEntries={entries}
                    openCaptionTrayKey={openCaptionTrayKey}
                    onToggleCaption={handleToggleCaption}
                    onRemoveEntry={handleRemoveEntry}
                    onRetryEntry={retryEntry}
                />

                {openCaptionEntry && (
                    <div className="composer-attachment-caption-row">
                        <label className="composer-attachment-caption-label" htmlFor="composer-attachment-caption-input">
                            {openCaptionEntry.fileName}
                        </label>
                        <input
                            id="composer-attachment-caption-input"
                            className="composer-attachment-caption-input"
                            type="text"
                            value={openCaptionEntry.caption}
                            placeholder="What should the assistant look for?"
                            onChange={(event) => setEntryCaption(openCaptionEntry.trayKey, event.target.value)}
                        />
                    </div>
                )}

                {trayError && (
                    <div className="composer-attachment-tray-error" role="status">{trayError}</div>
                )}

                <div className="chat-input-row">
                    {children}
                </div>
            </div>

            <button
                type="button"
                className="composer-attach-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || isAtCap}
                aria-label={isAtCap ? `Attachment limit of ${MAX_ATTACHMENTS_PER_MESSAGE} images reached` : 'Attach an image'}
                title={isAtCap ? `Attachment limit of ${MAX_ATTACHMENTS_PER_MESSAGE} images reached` : 'Attach an image'}
            >
                <PaperClipIcon/>
            </button>

            <input
                ref={fileInputRef}
                className="composer-attachment-file-input"
                type="file"
                multiple
                accept={ACCEPTED_IMAGE_ACCEPT_ATTRIBUTE}
                onChange={handleFileInputChange}
                tabIndex={-1}
                aria-hidden="true"
            />
        </>
    );
}

export default ComposerAttachments;
