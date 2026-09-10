import {useCallback, useEffect, useRef} from 'react';
import {useNavigate, useParams} from 'react-router';
import {useSharedData} from '../context/useSharedData.jsx';

/*
 * Keeps `/chat/{chatId}` and the shared `chatId` agreeing, in whichever direction actually moved.
 *
 * One effect rather than a pair of one-directional ones. Two effects cannot tell a back
 * navigation to `/` from a new chat that has just learned its id: both leave the url empty while
 * state holds an id, so the state-to-url half would fire on the back navigation too and bounce
 * the user straight forward again.
 */
function useChatUrlSync() {
    const routeParams = useParams();
    const navigate = useNavigate();
    const {chatId, setChatId, setChatHistory} = useSharedData();

    /* Absent and null are the same thing here — "no chat open" — so the two compare equal below. */
    const routeChatId = routeParams.chatId ?? null;

    const previousRouteChatIdRef = useRef(routeChatId);
    const previousChatIdRef = useRef(chatId);
    const hasSyncedRef = useRef(false);

    /*
     * Returns to the index route with nothing open. Replaces rather than pushes, so a url that
     * failed to load cannot be reached again with Back.
     */
    const clearOpenChat = useCallback(() => {
        setChatHistory([]);
        setChatId(null);
        navigate('/', {replace: true});
    }, [setChatHistory, setChatId, navigate]);

    useEffect(() => {
        const routeChanged = previousRouteChatIdRef.current !== routeChatId;
        const chatIdChanged = previousChatIdRef.current !== chatId;
        const isFirstSync = !hasSyncedRef.current;

        previousRouteChatIdRef.current = routeChatId;
        previousChatIdRef.current = chatId;
        hasSyncedRef.current = true;

        if (routeChatId === chatId) {
            return;
        }

        /*
         * The url moved, or this is the first render and it is the only side with a claim on
         * what should be open. It wins either way, including when it moved to `/`: leaving a
         * transcript on screen under a url that no longer names it is the one outcome nothing
         * here should produce. The transcript is dropped in the same commit, so the blank
         * composer the user went back to is what they get.
         */
        if (isFirstSync || routeChanged) {
            if (!routeChatId) {
                setChatHistory([]);
            }

            setChatId(routeChatId);

            return;
        }

        /*
         * State moved on its own, which today means exactly one thing: a new chat adopting the
         * id from its first `init` frame, milliseconds into a stream. Replaced rather than
         * pushed — the user is mid-answer, and a pushed entry would leave Back pointing at a `/`
         * that clears the reply they are reading.
         */
        if (chatIdChanged) {
            navigate(chatId ? `/chat/${chatId}` : '/', {replace: true});
        }
    }, [routeChatId, chatId, setChatId, setChatHistory, navigate]);

    return {clearOpenChat};
}

export default useChatUrlSync;
