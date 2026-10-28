import {useCallback, useEffect, useState} from 'react';
import {useNavigate} from 'react-router';
import log from 'loglevel';
import {UserGroupIcon} from '@heroicons/react/24/solid/index.js';
import sharedSessionService from '../service/SharedSessionService.js';
import {PUSH_NAVIGATED_EVENT} from '../push/usePushNavigation.js';
import {forKnownSharedAgents} from './sharedAgents.js';
import './SharedSessions.css';

const RECHECK_AFTER_MILLISECONDS = 60 * 1000;

const SharedSessionsLink = () => {
    const navigate = useNavigate();
    const [waiting, setWaiting] = useState(false);

    const check = useCallback(async () => {
        try {
            const [sessions, invites] = await Promise.all([sharedSessionService.sessions(), sharedSessionService.incomingInvites()]);

            setWaiting(forKnownSharedAgents(sessions).some((session) => session.yourTurn) || forKnownSharedAgents(invites).length > 0);
        } catch (caughtError) {
            log.debug('[SharedSessionsLink] Could not check for shared sessions', caughtError);
        }
    }, []);

    useEffect(() => {
        void check();

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void check();
            }
        };

        const interval = setInterval(() => void check(), RECHECK_AFTER_MILLISECONDS);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener(PUSH_NAVIGATED_EVENT, check);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener(PUSH_NAVIGATED_EVENT, check);
        };
    }, [check]);

    return (
        <div className="icon-wrapper shared-sessions-link" onClick={() => navigate('/shared-sessions')} data-dialog="Shared sessions">
            <UserGroupIcon/>
            {waiting && <span className="shared-sessions-link-dot" aria-label="A shared session is waiting on you"/>}
        </div>
    );
};

export default SharedSessionsLink;
