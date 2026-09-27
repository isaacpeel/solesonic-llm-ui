import { buildUrl } from '../client/ApiClient.js';
import log from "loglevel";
import config from "../properties/ApplicationProperties.jsx";

const BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;
const AUTH_BLOCKED_UNTIL = 'authBlockedUntil';
const AUTH_FAILURES_KEY = 'authFailuresKey';

// The provider will set a keycloak instance
let keycloakInstance = null;

const authService = {
    /**
     * Sets the Keycloak instance (called by KeycloakProvider)
     */
    setKeycloakInstance: (keycloak) => {
        keycloakInstance = keycloak;
    },

    /**
     * Retrieves the access token from Keycloak.
     */
    getAccessToken: async () => {
        if (!keycloakInstance) {
            log.error('Keycloak instance not initialized');
            return null;
        }
        
        // Ensure the token is fresh
        try {
            await keycloakInstance.updateToken(5);
            return keycloakInstance.token;
        } catch (error) {
            log.error('Failed to refresh token:', error);
            return null;
        }
    },

    getUserId: async () => {
        if (!keycloakInstance) {
            log.error('Keycloak instance not initialized');
            return null;
        }
        
        const userProfile = keycloakInstance.tokenParsed;
        return userProfile?.sub || null;
    },

    getUsername: async () => {
        if (!keycloakInstance) {
            log.error('Keycloak instance not initialized');
            return null;
        }
        
        const userProfile = keycloakInstance.tokenParsed;
        return userProfile?.["given_name"] || userProfile?.username || null;
    },

    /**
     * Gets the user profile from Keycloak.
     */
    getUserProfile: async () => {
        if (!keycloakInstance) {
            log.error('Keycloak instance not initialized');
            return null;
        }
        
        try {
            return await keycloakInstance.loadUserProfile();
        } catch (error) {
            log.error('Failed to load user profile:', error);
            return null;
        }
    },
    readStoredFailures: () => {
        try {
            const storedFailures = JSON.parse(localStorage.getItem(AUTH_FAILURES_KEY));
            return Array.isArray(storedFailures) ? storedFailures : [];
        } catch (parseError) {
            log.warn('Stored auth failure count was unreadable; resetting', parseError);
            localStorage.removeItem(AUTH_FAILURES_KEY);
            return [];
        }
    },
    readBlockedUntil: () => {
        const storedBlockedUntil = localStorage.getItem(AUTH_BLOCKED_UNTIL);

        if (!storedBlockedUntil) {
            return null;
        }

        const blockedUntil = parseInt(storedBlockedUntil, 10);

        if (Number.isNaN(blockedUntil)) {
            log.warn('Stored auth block deadline was unreadable; ignoring');
            localStorage.removeItem(AUTH_BLOCKED_UNTIL);
            return null;
        }

        return blockedUntil;
    },
    authFailure: async (error) => {
        const uri = buildUrl(`${config.uiBaseUri}/auth-failure`, { error: `${error}` });

        try {
            await fetch(uri);
        } catch {
            // fire-and-forget — errors are intentionally swallowed
        }

        const now = Date.now();

        let failures = authService.readStoredFailures();
        failures = failures.filter(attempt => now - attempt < BLOCK_DURATION_MS);
        failures.push(now);

        localStorage.setItem(AUTH_FAILURES_KEY, JSON.stringify(failures));

        if (failures.length >= MAX_ATTEMPTS) {
            localStorage.setItem(AUTH_BLOCKED_UNTIL, (now + BLOCK_DURATION_MS).toString());
        }
    },
    isBlocked: () => {
        try {
            const testKey = '__test__';
            localStorage.setItem(testKey, testKey);
            localStorage.removeItem(testKey);
        } catch (localStorageException) {
            authService.authFailure(localStorageException);
            return true; // Local storage is not supported
        }

        const blockedUntil = authService.readBlockedUntil();

        if (blockedUntil === null) {
            return false;
        }

        const currentlyBlocked = Date.now() < blockedUntil;

        if (!currentlyBlocked) {
            localStorage.removeItem(AUTH_FAILURES_KEY);
            localStorage.removeItem(AUTH_BLOCKED_UNTIL);
        }

        return currentlyBlocked;
    },
    remainingBlockTime: () => {
        const blockedUntil = authService.readBlockedUntil();

        if (blockedUntil === null) {
            return 0;
        }

        return Math.max(0, blockedUntil - Date.now());
    }
};

export default authService;
