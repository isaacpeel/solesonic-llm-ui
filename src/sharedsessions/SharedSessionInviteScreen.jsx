import {useEffect, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router';
import log from 'loglevel';
import sharedSessionService, {INVITE_STATUSES, describeSessionError} from '../service/SharedSessionService.js';
import {describeInvitation} from './sharedAgents.js';
import './SharedSessions.css';

const SharedSessionInviteScreen = () => {
    const {inviteId} = useParams();
    const navigate = useNavigate();

    const [invite, setInvite] = useState(null);
    const [notice, setNotice] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;

        sharedSessionService.getInvite(inviteId)
            .then((loaded) => {
                if (!cancelled) {
                    setInvite(loaded);
                }
            })
            .catch((caughtError) => {
                log.warn('[SharedSessionInviteScreen] Could not load the invite', caughtError);

                if (!cancelled) {
                    setNotice('That invite could not be found.');
                }
            });

        return () => {
            cancelled = true;
        };
    }, [inviteId]);

    const handleAccept = async () => {
        setBusy(true);

        try {
            const session = await sharedSessionService.acceptInvite(inviteId);
            navigate(`/shared-sessions/${session.id}`);
        } catch (caughtError) {
            setNotice(describeSessionError(caughtError));
        } finally {
            setBusy(false);
        }
    };

    const handleDecline = async () => {
        setBusy(true);

        try {
            await sharedSessionService.declineInvite(inviteId);
            navigate('/shared-sessions');
        } catch (caughtError) {
            setNotice(describeSessionError(caughtError));
        } finally {
            setBusy(false);
        }
    };

    const inviter = invite?.inviterDisplayName || invite?.inviterUsername || 'Someone';

    return (
        <div className="shared-session-invite-screen">
            {invite && invite.status === INVITE_STATUSES.PENDING ? (
                <>
                    <h2 className="shared-sessions-section-title">
                        {inviter} invited you to {describeInvitation(invite.agentName, invite.openingMessage)}
                    </h2>
                    <div className="shared-sessions-list-item-actions">
                        <button type="button" className="shared-sessions-button shared-sessions-button--primary" disabled={busy} onClick={handleAccept}>
                            Accept
                        </button>
                        <button type="button" className="shared-sessions-button" disabled={busy} onClick={handleDecline}>
                            Decline
                        </button>
                    </div>
                </>
            ) : invite ? (
                <p className="shared-sessions-notice">That invite is no longer open.</p>
            ) : null}
            {notice && <p className="shared-sessions-notice shared-sessions-notice--error" role="alert">{notice}</p>}
            <Link to="/shared-sessions">All shared sessions</Link>
        </div>
    );
};

export default SharedSessionInviteScreen;
