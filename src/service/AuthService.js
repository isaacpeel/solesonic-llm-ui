import {fetchAuthSession, getCurrentUser} from "aws-amplify/auth";
import axiosClient from "../client/AxiosClient.js";
import config from "../properties/ApplicationProperties.jsx";

const BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;
const AUTH_BLOCKED_UNTIL = 'authBlockedUntil';
const AUTH_FAILURES_KEY = 'authFailuresKey';

let accessToken = null;
let userId = null;

const authService = {
    /**
     * Retrieves the access token from the current session.
     */
    getAccessToken: async () => {
        const session = await authService.initializeUser();
        accessToken = session.tokens.accessToken; // Assumes `tokens.accessToken` structure
        return accessToken;
    },

    getUserId: async () => {
        const session = await authService.initializeUser();
        userId = session.userSub;

        return userId;
    },

    getUsername: async () => {
        const currentUser = await getCurrentUser();
        return currentUser.username;
    },

    /**
     * Initializes the user session and retrieves tokens.
     */
    initializeUser: async () => {
        return await fetchAuthSession(); // Returns the session object
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
