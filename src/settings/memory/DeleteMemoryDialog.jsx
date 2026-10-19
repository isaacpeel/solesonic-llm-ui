import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import log from "loglevel";

import "./DeleteMemoryDialog.css";
import {handleDialogKeyDown} from "../../util/dialogFocus.js";
import memoryService from "../../service/MemoryService.js";

const DELETE_FAILED_ERROR = "Could not delete the memory. Please try again.";

function DeleteMemoryDialog({memoryId, userId, content, onCancel, onDeleted}) {
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
            await memoryService.deleteMemory(memoryId, userId);
            onDeleted(memoryId);
        } catch (caughtError) {
            if (caughtError.status === 404) {
                onDeleted(memoryId);
                return;
            }

            log.error('[DeleteMemoryDialog] Delete failed', memoryId, caughtError);
            setDeleteError(DELETE_FAILED_ERROR);
            setDeleting(false);
        }
    };

    const handleKeyDown = (event) => handleDialogKeyDown(event, {
        containerElement: dialogRef.current,
        onDismiss: deleting ? () => {} : onCancel,
    });

    return createPortal(
        <div className="memory-dialog-backdrop" role="presentation" onKeyDown={handleKeyDown}>
            <div
                ref={dialogRef}
                className="memory-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-memory-dialog-title"
            >
                <h3 className="memory-dialog-title" id="delete-memory-dialog-title">Delete memory?</h3>

                <p className="memory-dialog-body">
                    <span className="memory-dialog-quote">{`"${content}"`}</span>
                    will be permanently deleted. This cannot be undone.
                </p>

                {deleteError && <p className="memory-dialog-error" role="alert">{deleteError}</p>}

                <div className="memory-dialog-actions">
                    <button
                        ref={cancelButtonRef}
                        type="button"
                        className="memory-dialog-cancel"
                        disabled={deleting}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        className="memory-dialog-confirm"
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

export default DeleteMemoryDialog;
