import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import log from "loglevel";

import "./DeleteInterestAgentDialog.css";
import {handleDialogKeyDown} from "../../util/dialogFocus.js";
import interestService from "../../service/InterestService.js";

const DELETE_FAILED_ERROR = "Couldn't stop this interest. Please try again.";

function DeleteInterestAgentDialog({agent, onCancel, onDeleted}) {
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
            await interestService.deleteAgent(agent.id);
            onDeleted(agent.id);
        } catch (caughtError) {
            if (caughtError?.status === 404) {
                onDeleted(agent.id);
                return;
            }

            log.error('[DeleteInterestAgentDialog] Delete failed', agent.id, caughtError);
            setDeleteError(DELETE_FAILED_ERROR);
            setDeleting(false);
        }
    };

    const handleKeyDown = (event) => handleDialogKeyDown(event, {
        containerElement: dialogRef.current,
        onDismiss: deleting ? () => {} : onCancel,
    });

    return createPortal(
        <div className="interest-dialog-backdrop" role="presentation" onKeyDown={handleKeyDown}>
            <div
                ref={dialogRef}
                className="interest-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-interest-dialog-title"
            >
                <h3 className="interest-dialog-title" id="delete-interest-dialog-title">
                    Stop news about {agent.label}?
                </h3>

                <p className="interest-dialog-body">Past updates stay in your chats.</p>

                {deleteError && <p className="interest-dialog-error" role="alert">{deleteError}</p>}

                <div className="interest-dialog-actions">
                    <button
                        ref={cancelButtonRef}
                        type="button"
                        className="interest-dialog-cancel"
                        disabled={deleting}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        className="interest-dialog-confirm"
                        disabled={deleting}
                        onClick={handleConfirm}
                    >
                        {deleting ? "Stopping…" : "Stop news"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default DeleteInterestAgentDialog;
