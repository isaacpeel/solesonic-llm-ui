import {useEffect, useRef} from "react";
import {useNavigate} from "react-router";
import {toast} from "react-toastify";
import log from "loglevel";
import atlassianAuthService from "../service/AtlassianAuthService.js";
import "./AtlassianAuthCallback.css";

const ATLASSIAN_SETTINGS_PANEL = "atlassianSettings";
const ATLASSIAN_CALLBACK_PATH = "/atlassian/auth/callback";
const ATLASSIAN_CALLBACK_STASH_KEY = "atlassianAuthCallbackParams";

// Snapshot the query string at module load. Keycloak's login-required redirect runs before this
// component ever renders, and reading location at render time only works because keycloak-js
// returns its own parameters in the URL fragment. Snapshotting removes that dependency.
//
// A cold start loses the query entirely, because Keycloak navigates away and back. Stash it so
// the return trip can recover it. The stashed value is a single-use Atlassian authorization code
// that the backend exchanges with its own client secret - it is not a credential on its own.
const captureCallbackParams = () => {
    if (window.location.pathname !== ATLASSIAN_CALLBACK_PATH) {
        return '';
    }

    if (window.location.search) {
        sessionStorage.setItem(ATLASSIAN_CALLBACK_STASH_KEY, window.location.search);

        return window.location.search;
    }

    return sessionStorage.getItem(ATLASSIAN_CALLBACK_STASH_KEY) ?? '';
};

const initialSearch = captureCallbackParams();

const AtlassianAuthCallback = () => {
    const navigate = useNavigate();
    const exchangeStarted = useRef(false);

    useEffect(() => {
        if (exchangeStarted.current) {
            return;
        }

        exchangeStarted.current = true;

        sessionStorage.removeItem(ATLASSIAN_CALLBACK_STASH_KEY);

        const returnToSettings = () => {
            navigate('/settings', {replace: true, state: {panel: ATLASSIAN_SETTINGS_PANEL}});
        };

        const queryParams = new URLSearchParams(initialSearch);
        const authorizationCode = queryParams.get('code');
        const authorizationError = queryParams.get('error');

        if (authorizationError) {
            log.warn('[AtlassianAuthCallback] Atlassian declined:', authorizationError);
            toast.error('Atlassian connection was cancelled.');
            returnToSettings();

            return;
        }

        if (!authorizationCode) {
            returnToSettings();

            return;
        }

        atlassianAuthService.authCallback(authorizationCode)
            .then(() => {
                toast('Atlassian account connected');
            })
            .catch((caughtError) => {
                log.error('[AtlassianAuthCallback] Token exchange failed:', caughtError);
                toast.error(caughtError.status === 400
                    ? 'Atlassian declined the connection. Please try connecting again.'
                    : 'Could not connect your Atlassian account. Please try again.');
            })
            .finally(() => {
                returnToSettings();
            });
    }, [navigate]);

    return <div className="atlassian-auth-callback">Connecting your Atlassian account…</div>;
};

export default AtlassianAuthCallback;
