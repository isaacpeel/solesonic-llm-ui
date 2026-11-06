import {useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {useNavigate} from 'react-router';
import {toast} from 'react-toastify';
import log from 'loglevel';

import './ShareChatDialog.css';
import UserMultiSelect from '../common/UserMultiSelect.jsx';
import {CHAT_HISTORY_PORTAL_ATTRIBUTE} from '../chat/message/ChatRowMenu.jsx';
import {handleDialogKeyDown} from '../util/dialogFocus.js';
import {MAXIMUM_OTHER_PARTICIPANTS} from './sharedConversationLimits.js';
import sharedSessionService, {describeSessionError, unknownUsernamesFrom} from '../service/SharedSessionService.js';

const MAXIMUM_NAME_LENGTH = 255;

/**
 * Turns a chat into a shared one by choosing the people to share it with.
 *
 * Portalled and marked as part of the chat drawer for the same reason as `CreateChatGroupDialog`:
 * the drawer closes on any mouseup outside its own ref. The request lives here so a refusal keeps
 * the dialog open with the people already chosen.
 *
 * @param {{
 *   sourceChatId: string|null,
 *   chatName?: string,
 *   initialPeople?: Array<object>,
 *   onCancel: () => void,
 *   onShared?: (session: object) => void,
 * }} props
 */
function ShareChatDialog({sourceChatId = null, chatName = '', initialPeople = [], onCancel, onShared}) {
    const navigate = useNavigate();
    const titleId = useId();

    const [name, setName] = useState(chatName ?? '');
    const [people, setPeople] = useState(initialPeople);
    const [invalidUsernames, setInvalidUsernames] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [shareError, setShareError] = useState(null);

    const dialogRef = useRef(null);
    const submittingRef = useRef(false);
    const nameInputRef = useRef(null);

    useEffect(() => {
        const previouslyFocused = document.activeElement;

        nameInputRef.current?.focus();

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

        const usernames = people.map((person) => person.username);

        setSubmitting(true);
        setShareError(null);
        setInvalidUsernames([]);

        try {
            const session = await sharedSessionService.shareConversation({sourceChatId, usernames, name: name.trim()});

            toast(`Invites sent to ${usernames.join(', ')}`);
            navigate(`/shared-sessions/${session.id}`);
            onShared?.(session);
        } catch (caughtError) {
            log.warn('[ShareChatDialog] Could not share the chat', caughtError);
            setInvalidUsernames(unknownUsernamesFrom(caughtError));
            setShareError(describeSessionError(caughtError));
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
                <h3 className="share-chat-title" id={titleId}>Share this chat</h3>

                <input
                    ref={nameInputRef}
                    type="text"
                    className="share-chat-input"
                    aria-label="Chat name"
                    placeholder="Chat name (optional)"
                    value={name}
                    maxLength={MAXIMUM_NAME_LENGTH}
                    disabled={submitting}
                    onChange={(event) => setName(event.target.value)}
                />

                <UserMultiSelect
                    value={people}
                    onChange={handlePeopleChange}
                    max={MAXIMUM_OTHER_PARTICIPANTS}
                    disabled={submitting}
                    invalidUsernames={invalidUsernames}
                />

                <p className="share-chat-note">
                    {sourceChatId
                        ? 'Everyone you add will see the last messages of this chat (up to 500), including any replies that used your email, Jira or personal notes. '
                        : ''}
                    Attachments and images aren&apos;t shared. Your original chat stays private.
                    {' '}Each person&apos;s messages use their own model access.
                </p>

                {shareError && (
                    <p className="share-chat-error" role="alert">{shareError}</p>
                )}

                <div className="share-chat-actions">
                    <button type="button" className="share-chat-cancel" disabled={submitting} onClick={onCancel}>
                        Cancel
                    </button>

                    <button type="submit" className="share-chat-confirm" disabled={submitDisabled}>
                        {submitting ? 'Sharing…' : 'Share'}
                    </button>
                </div>
            </form>
        </div>,
        document.body,
    );
}

export default ShareChatDialog;
