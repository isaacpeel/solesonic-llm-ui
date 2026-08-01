/*
 * A backgrounded mobile page comes back in more than one way. A plain tab switch fires
 * `visibilitychange`; a page restored from the back/forward cache fires `pageshow` with
 * `persisted` set and — on iOS Safari — no `visibilitychange` at all. Anything waiting for the
 * user to return has to hear both, so both live behind one observer.
 */

export function isPageHidden() {
    if (typeof document === 'undefined') {
        return false;
    }

    return document.visibilityState === 'hidden';
}

export function observePageHidden(callback) {
    if (typeof document === 'undefined') {
        return () => {};
    }

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            callback();
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
}

export function observePageResumed(callback) {
    const hasDocument = typeof document !== 'undefined';
    const hasWindow = typeof window !== 'undefined';

    if (!hasDocument && !hasWindow) {
        return () => {};
    }

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            callback();
        }
    };

    const handlePageShow = (event) => {
        if (event?.persisted) {
            callback();
        }
    };

    if (hasDocument) {
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    if (hasWindow) {
        window.addEventListener('pageshow', handlePageShow);
    }

    return () => {
        if (hasDocument) {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        }

        if (hasWindow) {
            window.removeEventListener('pageshow', handlePageShow);
        }
    };
}
