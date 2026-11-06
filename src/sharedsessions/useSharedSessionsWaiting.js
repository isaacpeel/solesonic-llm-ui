import {useCallback, useEffect, useState} from 'react';
import log from 'loglevel';
import sharedSessionService from '../service/SharedSessionService.js';
import {PUSH_NAVIGATED_EVENT} from '../push/usePushNavigation.js';
import {forSupportedSessions, isConversationSession} from './sharedAgents.js';

const RECHECK_AFTER_MILLISECONDS = 60 * 1000;

const useSharedSessionsWaiting = () => {
    const [waiting, setWaiting] = useState(false);

    const check = useCallback(async () => {
        try {
            const [sessions, invites] = await Promise.all([sharedSessionService.sessions(), sharedSessionService.incomingInvites()]);

            setWaiting(forSupportedSessions(sessions).some((session) => session.yourTurn && !isConversationSession(session)) || forSupportedSessions(invites).length > 0);
        } catch (caughtError) {
            log.debug('[useSharedSessionsWaiting] Could not check for shared sessions', caughtError);
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

    return waiting;
};

export default useSharedSessionsWaiting;
