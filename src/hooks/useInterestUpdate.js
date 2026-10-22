import {useEffect, useRef, useState} from 'react';
import log from 'loglevel';
import interestService from '../service/InterestService.js';

function useInterestUpdate(chatId) {
    const [lookup, setLookup] = useState({chatId: null, update: null});
    const requestRef = useRef(0);

    useEffect(() => {
        requestRef.current += 1;
        const requestNumber = requestRef.current;

        if (!chatId) {
            return;
        }

        async function findUpdate() {
            try {
                const update = await interestService.getUpdateForChat(chatId);

                if (requestNumber === requestRef.current) {
                    setLookup({chatId, update: update ?? null});
                }
            } catch (caughtError) {
                if (requestNumber === requestRef.current) {
                    log.warn('[useInterestUpdate] Could not look up the news update for a chat', chatId, caughtError);
                    setLookup({chatId, update: null});
                }
            }
        }

        void findUpdate();
    }, [chatId]);

    return chatId && lookup.chatId === chatId ? lookup.update : null;
}

export default useInterestUpdate;
