import {useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import log from 'loglevel';

import './ShareChatDialog.css';
import UserMultiSelect from '../common/UserMultiSelect.jsx';
import {CHAT_HISTORY_PORTAL_ATTRIBUTE} from '../chat/message/ChatRowMenu.jsx';
import {handleDialogKeyDown} from '../util/dialogFocus.js';
import sharedSessionService, {describeSessionError, unknownUsernamesFrom} from '../service/SharedSessionService.js';

/**
 * Lets the owner of a shared chat invite more people into it.
 *
 * @param {{
 *   sessionId: string,
 *   excludeUserIds?: string[],
 *   maxPeople: number,
 *   onCancel: () => void,
 *   onInvited: (people: Array<{userId: string, username: string, displayName?: string}>) => void,
 * }} props
 */
function AddPeopleDialog({sessionId, excludeUserIds = [], maxPeople, onCancel, onInvited}) {
    const titleId = useId();

    const [people, setPeople] = useState([]);
    const [invalidUsernames, setInvalidUsernames] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [inviteError, setInviteError] = useState(null);

    const dialogRef = useRef(null);
    const submittingRef = useRef(false);

    useEffect(() => {
        const previouslyFocused = document.activeElement;

        dialogRef.current?.querySelector('input')?.focus();

        return () => {
            previouslyFocused?.focus?.();
        };
    }, []);

    const hasInvalidPerson = people.some((person) => invalidUsernames.some((name) => name.toLowerCase() === person.username.toLowerCase()));
    const submitDisabled = submitting || people.length === 0 || hasInvalidPerson;

    const handlePeopleChange = (next) => {
        setPeople(next);
        setInvalidUsernames((current) => current.filter((name) => next.some((person) => person.username.toLowerCase() === name.toLowerCase())));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (submitDisabled || submittingRef.current) {
            return;
        }

        submittingRef.current = true;

        setSubmitting(true);
        setInviteError(null);
        setInvalidUsernames([]);

        try {
            await sharedSessionService.inviteToSession(sessionId, people.map((person) => person.username));
            onInvited(people);
        } catch (caughtError) {
            log.warn('[AddPeopleDialog] Could not invite people', caughtError);
            setInvalidUsernames(unknownUsernamesFrom(caughtError));
            setInviteError(describeSessionError(caughtError));
            submittingRef.current = false;
            setSubmitting(false);
        }
    };

    const handleKeyDown = (event) => handleDialogKeyDown(event, {
        containerElement: dialogRef.current,
        onDismiss: () => {
            if (!submittingRef.current) {
                onCancel();
            }
        },
    });

    return createPortal(
        <div
            className="share-chat-backdrop"
            role="presentation"
            onKeyDown={handleKeyDown}
            {...{[CHAT_HISTORY_PORTAL_ATTRIBUTE]: 'true'}}
        >
            <form
                ref={dialogRef}
                className="share-chat-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onSubmit={handleSubmit}
            >
                <h3 className="share-chat-title" id={titleId}>Add people</h3>

                {maxPeople <= 0 ? (
                    <p className="share-chat-note">This chat is full.</p>
                ) : (
                    <UserMultiSelect
                        value={people}
                        onChange={handlePeopleChange}
                        max={maxPeople}
                        excludeUserIds={excludeUserIds}
                        disabled={submitting}
                        invalidUsernames={invalidUsernames}
                    />
                )}

                <p className="share-chat-note">
                    They will see this whole chat, including what was said before they joined, once they accept.
                </p>

                {inviteError && (
                    <p className="share-chat-error" role="alert">{inviteError}</p>
                )}

                <div className="share-chat-actions">
                    <button type="button" className="share-chat-cancel" disabled={submitting} onClick={onCancel}>
                        Cancel
                    </button>

                    <button type="submit" className="share-chat-confirm" disabled={submitDisabled}>
                        {submitting ? 'Inviting…' : 'Invite'}
                    </button>
                </div>
            </form>
        </div>,
        document.body,
    );
}

export default AddPeopleDialog;
