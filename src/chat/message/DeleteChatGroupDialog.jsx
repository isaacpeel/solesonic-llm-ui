import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import log from "loglevel";

import "./DeleteChatGroupDialog.css";
import {CHAT_HISTORY_PORTAL_ATTRIBUTE} from "./ChatRowMenu.jsx";
import {handleDialogKeyDown} from "../../util/dialogFocus.js";
import chatGroupService from "../../service/ChatGroupService.js";
import chatService from "../../service/ChatService.js";

const DELETE_GROUP_FAILED_ERROR = "Could not delete the group. Please try again.";

const LOAD_CONVERSATIONS_FAILED_ERROR =
    "Could not read the group's conversations, so nothing was deleted. Please try again.";

/*
 * Refused rather than worked around: a turn in flight writes a message when it finishes, and the
 * backend would run it to completion against a conversation that no longer exists.
 */
const STREAMING_REFUSAL =
    "A conversation in this group is still responding. Wait for it to finish, then try again.";

/*
 * Ceiling on the paging below, so a miscounted page never turns into an endless fetch. Twenty
 * conversations a page — see DEFAULT_CHAT_HISTORY_PAGE_SIZE — makes this two thousand of them.
 */
const MAXIMUM_PAGES = 100;

/**
 * Confirms deleting a conversation group, and asks what should happen to what is inside it.
 *
 * Three answers rather than two, because the destructive reading and the harmless one are both
 * plausible and the difference between them is everything: deleting the group alone frees its
 * conversations back into the date-ordered list, while deleting them too is irreversible.
 *
 * The API only ever does the first. It ungroups on delete — the foreign key is `on delete set null`
 * — so "and the conversations" is a cascade this dialog performs itself: read the whole group, then
 * delete each conversation, then the group. The order matters. Reading first is what lets a
 * streaming conversation be refused before anything has been destroyed.
 *
 * The requests live here rather than in the drawer so a failure can keep the dialog open with an
 * inline explanation, which is where the user is already looking — the same reason
 * `DeleteChatDialog` owns its own.
 *
 * @param {{
 *   chatGroupId: string,
 *   label: string,
 *   streamingChatId: string|null,
 *   onCancel: () => void,
 *   onConversationsDeleted: (deletedChatIds: Array<string>) => void,
 *   onDeleted: (chatGroupId: string, deletedChatIds: Array<string>) => void,
 * }} props
 */
function DeleteChatGroupDialog({
    chatGroupId,
    label,
    streamingChatId,
    onCancel,
    onConversationsDeleted,
    onDeleted,
}) {
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(null);
    const [deleteError, setDeleteError] = useState(null);

    const dialogRef = useRef(null);
    const cancelButtonRef = useRef(null);

    /*
     * Focus opens on Cancel — the safe answer when one of the other two is irreversible — and
     * returns to whatever opened the dialog, which is the group's kebab.
     */
    useEffect(() => {
        const previouslyFocused = document.activeElement;

        cancelButtonRef.current?.focus();

        return () => {
            previouslyFocused?.focus?.();
        };
    }, []);

    /* Every page of the group, because the drawer only holds the ones that were scrolled to. */
    const readEveryConversation = async () => {
        const chats = [];
        let pageNumber = 0;

        for (let pageCount = 0; pageCount < MAXIMUM_PAGES; pageCount += 1) {
            const page = await chatGroupService.findGroupChats(chatGroupId, {page: pageNumber});

            chats.push(...page.chats);

            if (page.last) {
                return chats;
            }

            pageNumber = page.page + 1;
        }

        return chats;
    };

    const deleteGroupOnly = async () => {
        await chatGroupService.deleteGroup(chatGroupId);
        onDeleted(chatGroupId, []);
    };

    const deleteGroupAndConversations = async () => {
        const chats = await readEveryConversation().catch(caughtError => {
            log.error('[DeleteChatGroupDialog] Reading the group failed', chatGroupId, caughtError);
            throw new Error(LOAD_CONVERSATIONS_FAILED_ERROR);
        });

        /* Checked after reading and before deleting, so a refusal costs nothing. */
        if (streamingChatId && chats.some(chat => chat.id === streamingChatId)) {
            throw new Error(STREAMING_REFUSAL);
        }

        const deletedChatIds = [];

        /*
         * One at a time. A burst of deletes is faster but leaves "how far did it get" unanswerable,
         * and this is the one operation where that question matters.
         */
        for (const chat of chats) {
            setProgress({done: deletedChatIds.length, total: chats.length});

            try {
                await chatService.deleteChat(chat.id);
            } catch (caughtError) {
                /* A repeat is a 404 rather than a 204: already gone is the outcome asked for. */
                if (caughtError.status !== 404) {
                    log.error('[DeleteChatGroupDialog] Deleting a conversation failed', chat.id, caughtError);

                    /*
                     * Reported through the other callback: the group survives holding whatever was
                     * not reached, so this is progress to fold into the drawer, not an ending. Only
                     * `onDeleted` closes the dialog, and the dialog has to stay open to explain.
                     */
                    onConversationsDeleted(deletedChatIds);
                    throw new Error(deletedChatIds.length === 0
                        ? DELETE_GROUP_FAILED_ERROR
                        : `Deleted ${deletedChatIds.length} of ${chats.length} conversations, then stopped. Please try again.`);
                }
            }

            deletedChatIds.push(chat.id);
        }

        await chatGroupService.deleteGroup(chatGroupId);
        onDeleted(chatGroupId, deletedChatIds);
    };

    const confirm = async (deleteConversations) => {
        if (busy) {
            return;
        }

        setBusy(true);
        setProgress(null);
        setDeleteError(null);

        try {
            if (deleteConversations) {
                await deleteGroupAndConversations();
                return;
            }

            await deleteGroupOnly();
        } catch (caughtError) {
            /*
             * The group being gone already is the outcome that was asked for; only a real failure
             * keeps the dialog open.
             */
            if (caughtError.status === 404) {
                onDeleted(chatGroupId, []);
                return;
            }

            log.error('[DeleteChatGroupDialog] Delete failed', chatGroupId, caughtError);
            setDeleteError(caughtError.message || DELETE_GROUP_FAILED_ERROR);
            setProgress(null);
            setBusy(false);
        }
    };

    const handleKeyDown = (event) => handleDialogKeyDown(event, {
        containerElement: dialogRef.current,
        onDismiss: onCancel,
    });

    return createPortal(
        <div
            className="delete-chat-group-backdrop"
            role="presentation"
            onKeyDown={handleKeyDown}
            {...{[CHAT_HISTORY_PORTAL_ATTRIBUTE]: "true"}}
        >
            <div
                ref={dialogRef}
                className="delete-chat-group-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-chat-group-dialog-title"
            >
                <h3 className="delete-chat-group-dialog-title" id="delete-chat-group-dialog-title">
                    Delete group?
                </h3>

                <p className="delete-chat-group-dialog-body">
                    <span className="delete-chat-group-dialog-label">{`"${label}"`}</span>
                </p>

                {progress && (
                    <p className="delete-chat-group-dialog-progress" role="status">
                        {`Deleting ${progress.done + 1} of ${progress.total} conversations…`}
                    </p>
                )}

                {deleteError && (
                    <p className="delete-chat-group-dialog-error" role="alert">{deleteError}</p>
                )}

                <div className="delete-chat-group-dialog-actions">
                    <button
                        ref={cancelButtonRef}
                        type="button"
                        className="delete-chat-group-dialog-cancel"
                        disabled={busy}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        className="delete-chat-group-dialog-keep-chats"
                        disabled={busy}
                        onClick={() => confirm(false)}
                    >
                        Delete
                    </button>

                    <button
                        type="button"
                        className="delete-chat-group-dialog-confirm"
                        disabled={busy}
                        onClick={() => confirm(true)}
                    >
                        Delete all
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default DeleteChatGroupDialog;
