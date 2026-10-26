import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import log from "loglevel";

import {handleDialogKeyDown} from "../../util/dialogFocus.js";
import llmKeyService from "../../service/LlmKeyService.js";
import "./RemoveLlmKeyDialog.css";

const REMOVE_FAILED_ERROR = "Could not remove model access. Please try again.";
const NO_PERMISSION_ERROR = "You no longer have permission to manage model access.";

function RemoveLlmKeyDialog({summary, onCancel, onRemoved}) {
    const [removing, setRemoving] = useState(false);
    const [removeError, setRemoveError] = useState(null);

    const dialogRef = useRef(null);
    const cancelButtonRef = useRef(null);

    const displayName = summary.username ?? summary.userId;

    useEffect(() => {
        const previouslyFocused = document.activeElement;

        cancelButtonRef.current?.focus();

        return () => {
            if (previouslyFocused?.isConnected) {
                previouslyFocused.focus?.();
                return;
            }

            document.querySelector(".model-access-settings h2")?.focus?.();
        };
    }, []);

    const handleConfirm = async () => {
        if (removing) {
            return;
        }

        setRemoving(true);
        setRemoveError(null);

        try {
            await llmKeyService.removeKey(summary.userId);
            onRemoved(summary.userId, {alreadyRemoved: false});
        } catch (caughtError) {
            if (caughtError?.status === 404) {
                onRemoved(summary.userId, {alreadyRemoved: true});
                return;
            }

            log.error('[RemoveLlmKeyDialog] Remove failed', summary.userId, caughtError);
            setRemoveError(caughtError?.status === 403 ? NO_PERMISSION_ERROR : REMOVE_FAILED_ERROR);
            setRemoving(false);
        }
    };

    const handleKeyDown = (event) => handleDialogKeyDown(event, {
        containerElement: dialogRef.current,
        onDismiss: removing ? () => {} : onCancel,
    });

    return createPortal(
        <div className="llm-key-dialog-backdrop" role="presentation" onKeyDown={handleKeyDown}>
            <div
                ref={dialogRef}
                className="llm-key-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="remove-llm-key-dialog-title"
            >
                <h3 className="llm-key-dialog-title" id="remove-llm-key-dialog-title">
                    {`Remove model access for ${displayName}?`}
                </h3>

                <p className="llm-key-dialog-body">
                    They lose it on their next message. Their chats, memories and documents are kept.
                </p>

                {removeError && <p className="llm-key-dialog-error" role="alert">{removeError}</p>}

                <div className="llm-key-dialog-actions">
                    <button
                        ref={cancelButtonRef}
                        type="button"
                        className="llm-key-dialog-cancel"
                        disabled={removing}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        className="llm-key-dialog-confirm"
                        disabled={removing}
                        onClick={handleConfirm}
                    >
                        {removing ? "Removing…" : "Remove access"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default RemoveLlmKeyDialog;
