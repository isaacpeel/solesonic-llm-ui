import {useEffect} from 'react';
import {isSafeAppPath} from '../util/safeAppPath.js';

export const PUSH_NAVIGATE_MESSAGE = 'push:navigate';

function usePushNavigation(navigate) {
    useEffect(() => {
        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
            return;
        }

        const handleMessage = (event) => {
            const message = event.data;

            if (message?.type !== PUSH_NAVIGATE_MESSAGE || !isSafeAppPath(message.url, window.location.origin)) {
                return;
            }

            navigate(message.url);
        };

        const serviceWorkerContainer = navigator.serviceWorker;
        serviceWorkerContainer.addEventListener('message', handleMessage);

        return () => {
            serviceWorkerContainer.removeEventListener('message', handleMessage);
        };
    }, [navigate]);
}

export default usePushNavigation;
