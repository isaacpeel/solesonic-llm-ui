import {useEffect, useRef} from 'react';
import pushSubscriptionService from '../service/PushSubscriptionService.js';

const PushSubscriptionSync = () => {
    const didSyncRef = useRef(false);

    useEffect(() => {
        if (didSyncRef.current) {
            return;
        }

        didSyncRef.current = true;
        void pushSubscriptionService.syncOnLoad();
    }, []);

    return null;
};

export default PushSubscriptionSync;
