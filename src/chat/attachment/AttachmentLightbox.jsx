import {useEffect, useRef} from 'react';
import {XMarkIcon} from '@heroicons/react/20/solid';
import MessageCopyButton from '../message/MessageCopyButton.jsx';
import './AttachmentLightbox.css';

/*
 * Rendered by ChatScreen as a peer of the message list, next to the conditional
 * ElicitationPrompt — that keeps the overlay out of a bubble's stacking context without
 * introducing a portal, which appears nowhere else in this codebase.
 */
function AttachmentLightbox({attachment, onClose}) {
    const dialogRef = useRef(null);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }

            if (event.key !== 'Tab') {
                return;
            }

            /* Focus trap: only the close button is focusable, so Tab always returns to it. */
            const closeButton = dialogRef.current?.querySelector('.attachment-lightbox-close');

            if (closeButton) {
                event.preventDefault();
                closeButton.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        dialogRef.current?.querySelector('.attachment-lightbox-close')?.focus();

        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    if (!attachment) {
        return null;
    }

    const altText = attachment.description || attachment.fileName || 'Attached image';

    return (
        <div
            className="attachment-lightbox-backdrop"
            onClick={onClose}
            role="presentation"
        >
            <div
                ref={dialogRef}
                className="attachment-lightbox"
                role="dialog"
                aria-modal="true"
                aria-label={altText}
                onClick={(event) => event.stopPropagation()}
            >
                <button
                    type="button"
                    className="attachment-lightbox-close"
                    onClick={onClose}
                    aria-label="Close image"
                >
                    <XMarkIcon/>
                </button>

                <img
                    className="attachment-lightbox-image"
                    src={attachment.objectUrl}
                    alt={altText}
                />

                {attachment.description && (
                    <div className="attachment-lightbox-caption-row">
                        <p className="attachment-lightbox-caption">{attachment.description}</p>
                        <MessageCopyButton text={attachment.description}/>
                    </div>
                )}
            </div>
        </div>
    );
}

export default AttachmentLightbox;
