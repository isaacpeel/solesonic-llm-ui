import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import log from "loglevel";

import "./DeleteChatDialog.css";
import {CHAT_HISTORY_PORTAL_ATTRIBUTE} from "./ChatRowMenu.jsx";
import chatService from "../service/ChatService.js";

const DELETE_FAILED_ERROR = "Could not delete the conversation. Please try again.";

const STREAMING_REFUSAL = "Wait for the response to finish.";

/**
 * Confirms deleting a conversation.
 *
 * Deletion cascades to every message, the attachments bound to them, and the images generated in
 * the conversation, and the backend has no trash and no undo — so this is a modal the user has to
 * answer rather than a menu click with a toast offering to put it back. There is deliberately no
 * undo affordance anywhere: offering one would be a lie.
 *
 * Portalled to `document.body` and marked as part of the drawer, because `ChatHistory` closes the
 * whole drawer on any mouseup outside its own ref — without the marker the drawer would close out
 * from under this dialog on the first click into it.
 *
 * The request lives here rather than in the drawer so a failure can keep the dialog open with an
 * inline explanation, which is where the user is already looking.
 *
 * @param {{
 *   chatId: string,
 *   label: string,
 *   streaming: boolean,
 *   onCancel: () => void,
 *   onDeleted: (chatId: string) => void,
 * }} props
 */
function DeleteChatDialog({chatId, label, streaming, onCancel, onDeleted}) {
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState(null);

    const dialogRef = useRef(null);
    const cancelButtonRef = useRef(null);

    /*
     * Focus opens on Cancel — the safe answer for an irreversible action — and returns to whatever
     * opened the dialog, which is the row's kebab. Same capture-and-restore the lightbox uses.
     */
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

        /*
         * Re-checked here as well as on the menu item: the turn can start after the dialog opens,
         * and the backend would run it to completion against a conversation that no longer exists.
         */
        if (streaming) {
            setDeleteError(STREAMING_REFUSAL);
            return;
        }

        setDeleting(true);
        setDeleteError(null);

        try {
            await chatService.deleteChat(chatId);
            onDeleted(chatId);
        } catch (caughtError) {
            /*
             * A repeated delete is a 404 rather than a 204, so the conversation being absent is the
             * outcome the user asked for — only the row was stale, which is not their problem.
             */
            if (caughtError.status === 404) {
                onDeleted(chatId);
                return;
            }

            log.error('[DeleteChatDialog] Delete failed', chatId, caughtError);
            setDeleteError(DELETE_FAILED_ERROR);
            setDeleting(false);
        }
    };

    const handleKeyDown = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            /* The drawer is listening above this dialog; dismissing it is not a drawer gesture. */
            event.stopPropagation();
            onCancel();
            return;
        }

        if (event.key !== "Tab") {
            return;
        }

        /* Focus trap: two buttons, so wrapping by hand is cheaper than a focus-scope helper. */
        const focusableElements = Array.from(
            dialogRef.current?.querySelectorAll("button:not([disabled])") ?? []
        );

        if (focusableElements.length === 0) {
            return;
        }

        const currentIndex = focusableElements.indexOf(document.activeElement);
        const step = event.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + step + focusableElements.length) % focusableElements.length;

        event.preventDefault();
        focusableElements[nextIndex].focus();
    };

    return createPortal(
        <div
            className="delete-chat-backdrop"
            role="presentation"
            onKeyDown={handleKeyDown}
            {...{[CHAT_HISTORY_PORTAL_ATTRIBUTE]: "true"}}
        >
            <div
                ref={dialogRef}
                className="delete-chat-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-chat-dialog-title"
            >
                <h3 className="delete-chat-dialog-title" id="delete-chat-dialog-title">
                    Delete conversation?
                </h3>

                {/* The label is clamped rather than truncated at a character count, because it can
                  * be a whole first message — and the clamp puts it on its own line above the rest
                  * of the sentence, which reads as the name of the thing being deleted. */}
                <p className="delete-chat-dialog-body">
                    <span className="delete-chat-dialog-label">{`"${label}"`}</span>
                    and all of its messages, attachments, and generated images will be permanently
                    deleted. This cannot be undone.
                </p>

                {deleteError && (
                    <p className="delete-chat-dialog-error" role="alert">{deleteError}</p>
                )}

                <div className="delete-chat-dialog-actions">
                    <button
                        ref={cancelButtonRef}
                        type="button"
                        className="delete-chat-dialog-cancel"
                        disabled={deleting}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        className="delete-chat-dialog-confirm"
                        disabled={deleting || streaming}
                        title={streaming ? STREAMING_REFUSAL : undefined}
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

export default DeleteChatDialog;
