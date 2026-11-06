import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import log from 'loglevel';

import '../chat/message/DeleteChatDialog.css';
import {CHAT_HISTORY_PORTAL_ATTRIBUTE} from '../chat/message/ChatRowMenu.jsx';
import {handleDialogKeyDown} from '../util/dialogFocus.js';
import sharedSessionService from '../service/SharedSessionService.js';

const LEAVE_FAILED_ERROR = 'Could not leave the chat. Please try again.';
const END_FAILED_ERROR = 'Could not end sharing. Please try again.';

function LeaveSharedChatDialog({sharedSessionId, label, owner, onCancel, onLeft}) {
    const [working, setWorking] = useState(false);
    const [errorText, setErrorText] = useState(null);

    const dialogRef = useRef(null);
    const cancelButtonRef = useRef(null);

    useEffect(() => {
        const previouslyFocused = document.activeElement;

        cancelButtonRef.current?.focus();

        return () => {
            if (previouslyFocused?.isConnected) {
                previouslyFocused.focus?.();
                return;
            }

            document.querySelector('[aria-label="Search chats"]')?.focus?.();
        };
    }, []);

    const handleCancel = () => {
        if (!working) {
            onCancel();
        }
    };

    const handleConfirm = async () => {
        if (working) {
            return;
        }

        setWorking(true);
        setErrorText(null);

        try {
            await sharedSessionService.leave(sharedSessionId);
            onLeft();
        } catch (caughtError) {
            if (caughtError?.status === 404) {
                onLeft();
                return;
            }

            log.error('[LeaveSharedChatDialog] Leave failed', sharedSessionId, caughtError);
            setErrorText(owner ? END_FAILED_ERROR : LEAVE_FAILED_ERROR);
            setWorking(false);
            cancelButtonRef.current?.focus();
        }
    };

    const handleKeyDown = (event) => handleDialogKeyDown(event, {
        containerElement: dialogRef.current,
        onDismiss: handleCancel,
    });

    const confirmLabel = owner ? 'End sharing' : 'Leave chat';

    return createPortal(
        <div
            className="delete-chat-backdrop"
            role="presentation"
            onKeyDown={handleKeyDown}
            {...{[CHAT_HISTORY_PORTAL_ATTRIBUTE]: 'true'}}
        >
            <div
                ref={dialogRef}
                className="delete-chat-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="leave-shared-chat-dialog-title"
                aria-describedby="leave-shared-chat-dialog-body"
            >
                <h3 className="delete-chat-dialog-title" id="leave-shared-chat-dialog-title">
                    {owner ? 'End sharing for everyone?' : 'Leave this chat?'}
                </h3>

                <p className="delete-chat-dialog-body" id="leave-shared-chat-dialog-body">
                    <span className="delete-chat-dialog-label">{`"${label}"`}</span>
                    {owner
                        ? 'will close for everyone in it, and nobody can send messages to it afterwards.'
                        : 'will drop out of your history, and you can only rejoin if you are invited again.'}
                </p>

                {errorText && (
                    <p className="delete-chat-dialog-error" role="alert">{errorText}</p>
                )}

                <div className="delete-chat-dialog-actions">
                    <button
                        ref={cancelButtonRef}
                        type="button"
                        className="delete-chat-dialog-cancel"
                        aria-disabled={working}
                        onClick={handleCancel}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        className="delete-chat-dialog-confirm"
                        aria-disabled={working}
                        onClick={handleConfirm}
                    >
                        {working ? 'Working…' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default LeaveSharedChatDialog;
