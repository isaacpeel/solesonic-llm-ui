import axiosClient from "../client/AxiosClient.js";
import config from "../properties/ApplicationProperties.jsx";

const BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;
const AUTH_BLOCKED_UNTIL = 'authBlockedUntil';
const AUTH_FAILURES_KEY = 'authFailuresKey';

// Keycloak instance will be set by the provider
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
            console.error('Keycloak instance not initialized');
            return null;
        }
        
        // Ensure token is fresh
        try {
            await keycloakInstance.updateToken(5);
            return keycloakInstance.token;
        } catch (error) {
            console.error('Failed to refresh token:', error);
            return null;
        }
    },

    getUserId: async () => {
        if (!keycloakInstance) {
            console.error('Keycloak instance not initialized');
            return null;
        }
        
        const userProfile = keycloakInstance.tokenParsed;
        return userProfile?.sub || null;
    },

    getUsername: async () => {
        if (!keycloakInstance) {
            console.error('Keycloak instance not initialized');
            return null;
        }
        
        const userProfile = keycloakInstance.tokenParsed;
        return userProfile?.preferred_username || userProfile?.username || null;
    },

    /**
     * Gets the user profile from Keycloak.
     */
    getUserProfile: async () => {
        if (!keycloakInstance) {
            console.error('Keycloak instance not initialized');
            return null;
        }
        
        try {
            return await keycloakInstance.loadUserProfile();
        } catch (error) {
            console.error('Failed to load user profile:', error);
            return null;
        }
    },
    authFailure: async (error) => {
        const uri = `${config.uiBaseUri}/auth-failure`;
        const queryParams = {error: `${error}`};
        const options = {noOp: true};

        const fullUri = axiosClient.buildUrl(uri, queryParams);
        await axiosClient.get(fullUri, options);

        const now = Date.now();

        let failures = JSON.parse(localStorage.getItem(AUTH_FAILURES_KEY)) || [];
        failures = failures.filter(attempt => now - attempt < BLOCK_DURATION_MS);
        failures.push(now);

        localStorage.setItem(AUTH_FAILURES_KEY, JSON.stringify(failures));

        if (failures.length >= MAX_ATTEMPTS) {
            localStorage.setItem(AUTH_BLOCKED_UNTIL, (now + BLOCK_DURATION_MS).toString());
        }
    },
    isBlocked: () => {
        const blockedUntil = localStorage.getItem(AUTH_BLOCKED_UNTIL);

        //If the browser doesn't support local storage it's probably a bot and always block
        try {
            const testKey = '__test__';
            localStorage.setItem(testKey, testKey);
            localStorage.removeItem(testKey);
        } catch (localStorageException) {
            this.authFailure(localStorageException);
            return true; // Local storage is not supported
        }

        if(!blockedUntil) {
            return false;
        }

        let currentlyBlocked =  blockedUntil && Date.now() < parseInt(blockedUntil, 10);

        if(currentlyBlocked) {
            localStorage.removeItem(AUTH_FAILURES_KEY);
        }

        return currentlyBlocked;
    },
    remainingBlockTime: () => {
        const blockedUntil = localStorage.getItem(AUTH_BLOCKED_UNTIL);

        if(!blockedUntil) {
            return 0;
        }

        return Math.max(0, parseInt(blockedUntil, 10) - Date.now());
    }
};

export default authService;
