import {useEffect, useRef} from "react";
import {useNavigate} from "react-router";
import {toast} from "react-toastify";
import log from "loglevel";
import googleAuthService from "../../service/GoogleAuthService.js";
import "./GoogleAuthCallback.css";

const GOOGLE_SETTINGS_PANEL = "googleSettings";
const GOOGLE_CALLBACK_PATH = "/google/auth/callback";
const GOOGLE_CALLBACK_STASH_KEY = "googleAuthCallbackParams";

// Snapshot the query string at module load. Keycloak's login-required redirect runs before this
// component ever renders, and reading location at render time only works because keycloak-js
// returns its own parameters in the URL fragment. Snapshotting removes that dependency.
//
// A cold start loses the query entirely, because Keycloak navigates away and back. Stash it so
// the return trip can recover it. The stashed value is a single-use Google authorization code
// that the backend exchanges with its own client secret - it is not a credential on its own.
const captureCallbackParams = () => {
    if (window.location.pathname !== GOOGLE_CALLBACK_PATH) {
        return '';
    }

    if (window.location.search) {
        sessionStorage.setItem(GOOGLE_CALLBACK_STASH_KEY, window.location.search);

        return window.location.search;
    }

    return sessionStorage.getItem(GOOGLE_CALLBACK_STASH_KEY) ?? '';
};

const initialSearch = captureCallbackParams();

const GoogleAuthCallback = () => {
    const navigate = useNavigate();
    const exchangeStarted = useRef(false);

    useEffect(() => {
        if (exchangeStarted.current) {
            return;
        }

        exchangeStarted.current = true;

        sessionStorage.removeItem(GOOGLE_CALLBACK_STASH_KEY);

        const returnToSettings = () => {
            navigate('/settings', {replace: true, state: {panel: GOOGLE_SETTINGS_PANEL}});
        };

        const queryParams = new URLSearchParams(initialSearch);
        const authorizationCode = queryParams.get('code');
        const authorizationError = queryParams.get('error');

        if (authorizationError) {
            log.warn('[GoogleAuthCallback] Google declined:', authorizationError);
            toast.error('Google connection was cancelled.');
            returnToSettings();

            return;
        }

        if (!authorizationCode) {
            returnToSettings();

            return;
        }

        googleAuthService.authCallback(authorizationCode)
            .then(() => {
                toast('Google account connected');
            })
            .catch((caughtError) => {
                log.error('[GoogleAuthCallback] Token exchange failed:', caughtError);
                toast.error(caughtError.status === 400
                    ? 'Google declined the connection. Please try connecting again.'
                    : 'Could not connect your Google account. Please try again.');
            })
            .finally(() => {
                returnToSettings();
            });
    }, [navigate]);

    return <div className="google-auth-callback">Connecting your Google account…</div>;
};

export default GoogleAuthCallback;
