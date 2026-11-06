import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import log from "loglevel";

import "./DeleteMemoryDialog.css";
import "./ForgetAllMemoriesDialog.css";
import {handleDialogKeyDown} from "../../util/dialogFocus.js";
import memoryService from "../../service/MemoryService.js";

const CONFIRMATION_WORD = "forget";
const FORGET_FAILED_ERROR = "Could not forget your memories. Please try again.";

function ForgetAllMemoriesDialog({onCancel, onForgotten}) {
    const [typedConfirmation, setTypedConfirmation] = useState("");
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState(null);

    const dialogRef = useRef(null);
    const confirmationInputRef = useRef(null);

    const confirmed = typedConfirmation.trim().toLowerCase() === CONFIRMATION_WORD;

    useEffect(() => {
        const previouslyFocused = document.activeElement;

        confirmationInputRef.current?.focus();

        return () => {
            previouslyFocused?.focus?.();
        };
    }, []);

    const handleConfirm = async () => {
        if (!confirmed || deleting) {
            return;
        }

        setDeleting(true);
        setDeleteError(null);

        try {
            await memoryService.deleteAllMemories();
            onForgotten();
        } catch (caughtError) {
            log.error('[ForgetAllMemoriesDialog] Delete all failed', caughtError);
            setDeleteError(FORGET_FAILED_ERROR);
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
                aria-labelledby="forget-all-memories-dialog-title"
            >
                <h3 className="memory-dialog-title" id="forget-all-memories-dialog-title">Forget everything?</h3>

                <p className="memory-dialog-body">
                    Every memory about you — learned, remembered, or added by you — will be permanently deleted.
                    This cannot be undone.
                </p>

                <label className="forget-all-memories-label" htmlFor="forget-all-memories-confirmation">
                    Type {CONFIRMATION_WORD} to confirm
                </label>
                <input
                    ref={confirmationInputRef}
                    id="forget-all-memories-confirmation"
                    type="text"
                    className="forget-all-memories-input"
                    value={typedConfirmation}
                    onChange={(event) => setTypedConfirmation(event.target.value)}
                    disabled={deleting}
                    autoComplete="off"
                />

                {deleteError && <p className="memory-dialog-error" role="alert">{deleteError}</p>}

                <div className="memory-dialog-actions">
                    <button type="button" className="memory-dialog-cancel" disabled={deleting} onClick={onCancel}>
                        Cancel
                    </button>

                    <button
                        type="button"
                        className="memory-dialog-confirm"
                        disabled={!confirmed || deleting}
                        onClick={handleConfirm}
                    >
                        {deleting ? "Forgetting…" : "Forget everything"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default ForgetAllMemoriesDialog;
