import {useCallback, useEffect, useState} from 'react';
import {Link, useNavigate} from 'react-router';
import log from 'loglevel';
import sharedSessionService, {SESSION_STATUSES, describeSessionError} from '../service/SharedSessionService.js';
import authService from '../service/AuthService.js';
import UserMultiSelect from '../common/UserMultiSelect.jsx';
import ShareChatDialog from './ShareChatDialog.jsx';
import {
    SHARED_CHAT_OPTION,
    conversationStatusText,
    describeInvitation,
    forSupportedSessions,
    isConversationSession,
    sharedAgentForSession,
    sharedSessionOptions,
} from './sharedAgents.js';
import {otherParticipantNames} from './sharedSessionTranscript.js';
import './SharedSessions.css';

const SESSION_OPTIONS = sharedSessionOptions();

function inviteName(username, displayName) {
    return displayName || username || 'someone';
}

const waitsOnViewer = (session) => !!session.yourTurn && !isConversationSession(session);

function sessionStatusText(session) {
    if (isConversationSession(session)) {
        return conversationStatusText(session);
    }

    if (session.yourTurn) {
        return 'Waiting on you';
    }

    if (session.status === SESSION_STATUSES.COMPLETED) {
        return 'Completed';
    }

    return 'Waiting on others';
}

const SharedSessionsScreen = () => {
    const navigate = useNavigate();

    const [viewerUserId, setViewerUserId] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [incoming, setIncoming] = useState([]);
    const [outgoing, setOutgoing] = useState([]);
    const [invitee, setInvitee] = useState([]);
    const [sharing, setSharing] = useState(false);
    const [selectedValue, setSelectedValue] = useState(SESSION_OPTIONS[0].value);
    const [notice, setNotice] = useState(null);
    const [busy, setBusy] = useState(false);

    const selectedOption = SESSION_OPTIONS.find((option) => option.value === selectedValue) ?? SESSION_OPTIONS[0];
    const sharedChatSelected = selectedOption.value === SHARED_CHAT_OPTION;

    const refresh = useCallback(async () => {
        try {
            const [userId, sessionList, incomingInvites, outgoingInvites] = await Promise.all([
                authService.getUserId(),
                sharedSessionService.sessions(),
                sharedSessionService.incomingInvites(),
                sharedSessionService.outgoingInvites(),
            ]);

            setViewerUserId(userId);
            setSessions(forSupportedSessions(sessionList).sort((first, second) => Number(waitsOnViewer(second)) - Number(waitsOnViewer(first))));
            setIncoming(forSupportedSessions(incomingInvites));
            setOutgoing(forSupportedSessions(outgoingInvites));
        } catch (caughtError) {
            log.warn('[SharedSessionsScreen] Could not load shared sessions', caughtError);
            setNotice('Could not load your shared sessions.');
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const act = useCallback(async (action) => {
        setBusy(true);
        setNotice(null);

        try {
            return await action();
        } catch (caughtError) {
            setNotice(describeSessionError(caughtError));
            return null;
        } finally {
            setBusy(false);
        }
    }, []);

    const handleInvite = async (event) => {
        event.preventDefault();

        if (sharedChatSelected) {
            setSharing(true);
            return;
        }

        if (invitee.length === 0) {
            return;
        }

        const invite = await act(() => sharedSessionService.invite(invitee[0].username, selectedOption.agentName, selectedOption.openingMessage || undefined));

        if (invite) {
            setInvitee([]);
            setNotice('Invite sent.');
            await refresh();
        }
    };

    const handleAccept = async (inviteId) => {
        const session = await act(() => sharedSessionService.acceptInvite(inviteId));

        if (session?.id) {
            navigate(`/shared-sessions/${session.id}`);
        }
    };

    const handleDecline = async (inviteId) => {
        await act(() => sharedSessionService.declineInvite(inviteId));
        await refresh();
    };

    const handleCancelInvite = async (inviteId) => {
        await act(() => sharedSessionService.cancelInvite(inviteId));
        await refresh();
    };

    return (
        <div className="shared-sessions-screen">
            <section>
                <h2 className="shared-sessions-section-title">Invite someone to a shared session</h2>
                <form className="shared-sessions-invite-form" onSubmit={handleInvite}>
                    <div className="shared-sessions-invitee">
                        <UserMultiSelect
                            value={invitee}
                            onChange={setInvitee}
                            max={1}
                            disabled={busy}
                            placeholder="Their username"
                            ariaLabel="Username"
                        />
                    </div>
                    <select
                        className="shared-sessions-type-select"
                        value={selectedOption.value}
                        onChange={(event) => setSelectedValue(event.target.value)}
                        aria-label="Session type"
                    >
                        {SESSION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    <button
                        type="submit"
                        className="shared-sessions-button shared-sessions-button--primary"
                        disabled={busy || (!sharedChatSelected && invitee.length === 0)}
                    >
                        {sharedChatSelected ? 'Start chat' : 'Invite'}
                    </button>
                </form>
                {notice && <p className="shared-sessions-notice" role="status">{notice}</p>}
            </section>

            {incoming.length > 0 && (
                <section>
                    <h2 className="shared-sessions-section-title">Invites for you</h2>
                    <ul className="shared-sessions-list">
                        {incoming.map((invite) => (
                            <li key={invite.id} className="shared-sessions-list-item">
                                <span>{inviteName(invite.inviterUsername, invite.inviterDisplayName)} invited you · {describeInvitation(invite.agentName, invite.openingMessage, invite.mode, invite.sessionName)}</span>
                                <span className="shared-sessions-list-item-actions">
                                    <button type="button" className="shared-sessions-button shared-sessions-button--primary" disabled={busy}
                                            onClick={() => handleAccept(invite.id)}>Accept</button>
                                    <button type="button" className="shared-sessions-button" disabled={busy}
                                            onClick={() => handleDecline(invite.id)}>Decline</button>
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section>
                <h2 className="shared-sessions-section-title">Your shared sessions</h2>
                {sessions.length === 0 ? (
                    <p className="shared-sessions-notice">No shared sessions yet.</p>
                ) : (
                    <ul className="shared-sessions-list">
                        {sessions.map((session) => (
                            <li key={session.id}>
                                <Link to={`/shared-sessions/${session.id}`} className="shared-sessions-list-item shared-sessions-list-item--link">
                                    <span className="shared-sessions-list-item-name">
                                        {sharedAgentForSession(session).label} with {otherParticipantNames(session, viewerUserId).join(', ') || 'no one yet'}
                                    </span>
                                    <span className={session.yourTurn && !isConversationSession(session) ? 'shared-sessions-waiting-on-you' : 'shared-sessions-notice'}>
                                        {sessionStatusText(session)}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {outgoing.length > 0 && (
                <section>
                    <h2 className="shared-sessions-section-title">Waiting for an answer</h2>
                    <ul className="shared-sessions-list">
                        {outgoing.map((invite) => (
                            <li key={invite.id} className="shared-sessions-list-item">
                                <span>{inviteName(invite.inviteeUsername, invite.inviteeDisplayName)} · {describeInvitation(invite.agentName, invite.openingMessage, invite.mode, invite.sessionName)}</span>
                                <button type="button" className="shared-sessions-button" disabled={busy}
                                        onClick={() => handleCancelInvite(invite.id)}>Cancel</button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {sharing && (
                <ShareChatDialog
                    sourceChatId={null}
                    chatName=""
                    initialPeople={invitee}
                    onCancel={() => setSharing(false)}
                    onShared={() => setSharing(false)}
                />
            )}
        </div>
    );
};

export default SharedSessionsScreen;
