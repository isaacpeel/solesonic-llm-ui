import log from 'loglevel';

const SESSION_STORAGE_KEY = 'solesonic.keycloakSession';

export function readKeycloakSession() {
    if (typeof localStorage === 'undefined') {
        return null;
    }

    try {
        const storedValue = localStorage.getItem(SESSION_STORAGE_KEY);

        if (!storedValue) {
            return null;
        }

        const storedSession = JSON.parse(storedValue);

        if (typeof storedSession?.token !== 'string' || typeof storedSession?.refreshToken !== 'string') {
            clearKeycloakSession();
            return null;
        }

        return {
            token: storedSession.token,
            refreshToken: storedSession.refreshToken,
            idToken: typeof storedSession.idToken === 'string' ? storedSession.idToken : undefined,
        };
    } catch (caughtError) {
        log.error('[keycloakSessionStorage] Failed to read the stored session:', caughtError);
        clearKeycloakSession();

        return null;
    }
}

export function saveKeycloakSession({token, refreshToken, idToken}) {
    if (typeof localStorage === 'undefined' || !token || !refreshToken) {
        return;
    }

    try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({token, refreshToken, idToken}));
    } catch (caughtError) {
        log.error('[keycloakSessionStorage] Failed to persist the session:', caughtError);
    }
}

export function clearKeycloakSession() {
    if (typeof localStorage === 'undefined') {
        return;
    }

    try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (caughtError) {
        log.error('[keycloakSessionStorage] Failed to clear the stored session:', caughtError);
    }
}
