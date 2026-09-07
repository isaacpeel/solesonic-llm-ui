import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import log from "loglevel";

import "./DeleteGeneratedImageDialog.css";
import {handleDialogKeyDown} from "../../util/dialogFocus.js";
import generatedImageService from "../../service/GeneratedImageService.js";

const DELETE_FAILED_ERROR = "Could not delete the image. Please try again.";

/**
 * Confirms deleting a generated image. No trash, no undo — matches DeleteChatDialog's shape.
 *
 * When the image is still referenced by a chat message (`hasChatMessage`), the copy warns that
 * removing it also removes it from that conversation's history, per the API doc.
 */
function DeleteGeneratedImageDialog({imageId, label, hasChatMessage, isAdmin, onCancel, onDeleted}) {
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState(null);

    const dialogRef = useRef(null);
    const cancelButtonRef = useRef(null);

    useEffect(() => {
        const previouslyFocused = document.activeElement;

        cancelButtonRef.current?.focus();

        return () => {
            previouslyFocused?.focus?.();
        };
    }, []);

    const handleConfirm = async () => {
        if (deleting) {
            return;
        }

        setDeleting(true);
        setDeleteError(null);

        try {
            if (isAdmin) {
                await generatedImageService.deleteImageAdmin(imageId);
            } else {
                await generatedImageService.deleteImage(imageId);
            }

            onDeleted(imageId);
        } catch (caughtError) {
            if (caughtError.status === 404) {
                onDeleted(imageId);
                return;
            }

            log.error('[DeleteGeneratedImageDialog] Delete failed', imageId, caughtError);
            setDeleteError(DELETE_FAILED_ERROR);
            setDeleting(false);
        }
    };

    const handleKeyDown = (event) => handleDialogKeyDown(event, {
        containerElement: dialogRef.current,
        onDismiss: onCancel,
    });

    return createPortal(
        <div className="delete-generated-image-backdrop" role="presentation" onKeyDown={handleKeyDown}>
            <div
                ref={dialogRef}
                className="delete-generated-image-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-generated-image-dialog-title"
            >
                <h3 className="delete-generated-image-dialog-title" id="delete-generated-image-dialog-title">
                    Delete image?
                </h3>

                <p className="delete-generated-image-dialog-body">
                    <span className="delete-generated-image-dialog-label">{`"${label}"`}</span>
                    will be permanently deleted. This cannot be undone.
                    {hasChatMessage && (
                        " It was shown in a conversation — the next time that chat is loaded, the image will be gone from it too."
                    )}
                </p>

                {deleteError && (
                    <p className="delete-generated-image-dialog-error" role="alert">{deleteError}</p>
                )}

                <div className="delete-generated-image-dialog-actions">
                    <button
                        ref={cancelButtonRef}
                        type="button"
                        className="delete-generated-image-dialog-cancel"
                        disabled={deleting}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        className="delete-generated-image-dialog-confirm"
                        disabled={deleting}
                        onClick={handleConfirm}
                    >
                        {deleting ? "Deleting…" : "Delete"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default DeleteGeneratedImageDialog;
