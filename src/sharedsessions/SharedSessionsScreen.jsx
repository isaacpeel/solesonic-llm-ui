import {useCallback, useEffect, useState} from 'react';
import {Link, useNavigate} from 'react-router';
import log from 'loglevel';
import sharedSessionService, {SESSION_STATUSES, describeSessionError} from '../service/SharedSessionService.js';
import authService from '../service/AuthService.js';
import {SHARED_AGENT_NAMES, describeInvitation, forKnownSharedAgents, sharedAgentFor} from './sharedAgents.js';
import {otherParticipantNames} from './sharedSessionTranscript.js';
import './SharedSessions.css';

function firstOpeningOf(agentName) {
    return sharedAgentFor(agentName).openings[0]?.openingMessage ?? '';
}

function inviteName(username, displayName) {
    return displayName || username || 'someone';
}

function sessionStatusText(session) {
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
    const [username, setUsername] = useState('');
    const [agentName, setAgentName] = useState(SHARED_AGENT_NAMES[0]);
    const [openingMessage, setOpeningMessage] = useState(firstOpeningOf(SHARED_AGENT_NAMES[0]));
    const [notice, setNotice] = useState(null);
    const [busy, setBusy] = useState(false);

    const selectedAgent = sharedAgentFor(agentName);

    const refresh = useCallback(async () => {
        try {
            const [userId, sessionList, incomingInvites, outgoingInvites] = await Promise.all([
                authService.getUserId(),
                sharedSessionService.sessions(),
                sharedSessionService.incomingInvites(),
                sharedSessionService.outgoingInvites(),
            ]);

            setViewerUserId(userId);
            setSessions(forKnownSharedAgents(sessionList).sort((first, second) => Number(!!second.yourTurn) - Number(!!first.yourTurn)));
            setIncoming(forKnownSharedAgents(incomingInvites));
            setOutgoing(forKnownSharedAgents(outgoingInvites));
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

    const handleAgentChange = (event) => {
        setAgentName(event.target.value);
        setOpeningMessage(firstOpeningOf(event.target.value));
    };

    const handleInvite = async (event) => {
        event.preventDefault();

        if (!username.trim()) {
            return;
        }

        const invite = await act(() => sharedSessionService.invite(username.trim(), agentName, openingMessage || undefined));

        if (invite) {
            setUsername('');
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
                    <input
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="Their username"
                        aria-label="Username"
                    />
                    {SHARED_AGENT_NAMES.length > 1 && (
                        <select value={agentName} onChange={handleAgentChange} aria-label="Agent">
                            {SHARED_AGENT_NAMES.map((name) => (
                                <option key={name} value={name}>{sharedAgentFor(name).label}</option>
                            ))}
                        </select>
                    )}
                    {selectedAgent.openings.length > 0 && (
                        <select value={openingMessage} onChange={(event) => setOpeningMessage(event.target.value)} aria-label="How to start">
                            {selectedAgent.openings.map((opening) => (
                                <option key={opening.openingMessage} value={opening.openingMessage}>{opening.label}</option>
                            ))}
                        </select>
                    )}
                    <button type="submit" className="shared-sessions-button shared-sessions-button--primary" disabled={busy || !username.trim()}>
                        Invite
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
                                <span>{inviteName(invite.inviterUsername, invite.inviterDisplayName)} invited you · {describeInvitation(invite.agentName, invite.openingMessage)}</span>
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
                            <li key={session.id} className="shared-sessions-list-item">
                                <Link to={`/shared-sessions/${session.id}`}>
                                    {sharedAgentFor(session.agentName).label} with {otherParticipantNames(session, viewerUserId).join(', ') || 'no one yet'}
                                </Link>
                                <span className={session.yourTurn ? 'shared-sessions-waiting-on-you' : 'shared-sessions-notice'}>
                                    {sessionStatusText(session)}
                                </span>
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
                                <span>{inviteName(invite.inviteeUsername, invite.inviteeDisplayName)} · {describeInvitation(invite.agentName, invite.openingMessage)}</span>
                                <button type="button" className="shared-sessions-button" disabled={busy}
                                        onClick={() => handleCancelInvite(invite.id)}>Cancel</button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
};

export default SharedSessionsScreen;
