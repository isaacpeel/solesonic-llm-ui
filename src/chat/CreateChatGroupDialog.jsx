import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import log from "loglevel";

import "./CreateChatGroupDialog.css";
import {CHAT_HISTORY_PORTAL_ATTRIBUTE} from "./ChatRowMenu.jsx";
import {handleDialogKeyDown} from "../util/dialogFocus.js";
import chatGroupService from "../service/ChatGroupService.js";

/* Matches the server's column limit, so a name long enough to be rejected cannot be typed. */
const MAXIMUM_GROUP_NAME_LENGTH = 255;

const GENERIC_CREATE_ERROR = "That name could not be saved. Names must be 1–255 characters.";

/**
 * Names a new conversation group.
 *
 * Portalled to `document.body` and marked as part of the drawer, because `ChatHistory` closes the
 * whole drawer on any mouseup outside its own ref — without the marker the drawer would close
 * underneath this dialog on the first click into the field.
 *
 * The request lives here rather than in the drawer so a rejected name can keep the dialog open with
 * what the user typed still in it. Duplicate names are allowed by the API; they are neither blocked
 * nor warned about.
 *
 * @param {{
 *   onCancel: () => void,
 *   onCreated: (chatGroup: {id: string, name: string}) => void,
 * }} props
 */
function CreateChatGroupDialog({onCancel, onCreated}) {
    const [draftName, setDraftName] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [createError, setCreateError] = useState(null);

    const dialogRef = useRef(null);
    const inputRef = useRef(null);

    /* Focus goes to the field and comes back to whatever opened the dialog, the same way the
     * lightbox restores it — a dialog that drops focus on the body strands keyboard users. */
    useEffect(() => {
        const previouslyFocused = document.activeElement;

        inputRef.current?.focus();

        return () => {
            previouslyFocused?.focus?.();
        };
    }, []);

    const trimmedName = draftName.trim();
    const submitDisabled = submitting || trimmedName === "";

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (submitDisabled) {
            return;
        }

        setSubmitting(true);
        setCreateError(null);

        try {
            const createdGroup = await chatGroupService.createGroup(trimmedName);
            onCreated(createdGroup);
        } catch (caughtError) {
            log.error('[CreateChatGroupDialog] Create failed', trimmedName, caughtError);
            setCreateError(GENERIC_CREATE_ERROR);
            setSubmitting(false);
        }
    };

    const handleKeyDown = (event) => handleDialogKeyDown(event, {
        containerElement: dialogRef.current,
        onDismiss: onCancel,
    });

    return createPortal(
        <div
            className="create-chat-group-backdrop"
            role="presentation"
            onKeyDown={handleKeyDown}
            {...{[CHAT_HISTORY_PORTAL_ATTRIBUTE]: "true"}}
        >
            <form
                ref={dialogRef}
                className="create-chat-group-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-chat-group-title"
                onSubmit={handleSubmit}
            >
                <h3 className="create-chat-group-title" id="create-chat-group-title">New group</h3>

                <input
                    ref={inputRef}
                    type="text"
                    className="create-chat-group-input"
                    aria-label="Group name"
                    placeholder="Group name"
                    value={draftName}
                    maxLength={MAXIMUM_GROUP_NAME_LENGTH}
                    disabled={submitting}
                    onChange={(event) => setDraftName(event.target.value)}
                />

                {createError && (
                    <p className="create-chat-group-dialog-error" role="alert">{createError}</p>
                )}

                <div className="create-chat-group-actions">
                    <button
                        type="button"
                        className="create-chat-group-cancel"
                        disabled={submitting}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>

                    <button
                        type="submit"
                        className="create-chat-group-confirm"
                        disabled={submitDisabled}
                    >
                        {submitting ? "Creating…" : "Create"}
                    </button>
                </div>
            </form>
        </div>,
        document.body
    );
}

export default CreateChatGroupDialog;
