import {createContext, useContext, useEffect, useState, useRef} from 'react';
import Keycloak from 'keycloak-js';
import keycloakConfig from '../config/keycloak.js';
import PropTypes from 'prop-types';
import log from 'loglevel';
import {toast} from 'react-toastify';
import authService from '../service/AuthService.js';
import {observePageResumed} from '../util/pageLifecycle.js';

// Create Keycloak context
const KeycloakContext = createContext(null);

/**
 * KeycloakProvider Component
 *
 * Provides Keycloak authentication state and methods to the application.
 * Initializes Keycloak with PKCE (S256) and login-required.
 * Refreshes the access token on a 30-second interval, immediately when the tab resumes from
 * background, and via keycloak-js's own onTokenExpired schedule, whenever authenticated.
 *
 * Tokens are deliberately never written to sessionStorage or localStorage - they live
 * only in the keycloak-js instance, so an XSS foothold cannot exfiltrate a refresh
 * token that outlives the page.
 */
export const KeycloakProvider = ({children}) => {
    const [keycloak, setKeycloak] = useState(null);
    const [authenticated, setAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const didInitRef = useRef(false);

    // Initialize Keycloak exactly once
    useEffect(() => {
        // Prevent double initialization (React StrictMode double-mount guard)
        if (didInitRef.current) {
            return;
        }

        didInitRef.current = true;

        // Deliberately excludes the query string. Keycloak matches redirect_uri against the
        // client's Valid Redirect URIs, and an exact (non-wildcard) entry will not match a URL
        // carrying a query - it fails with "Invalid parameter: redirect_uri". Callbacks that
        // need their query parameters to survive a cold-start login redirect stash them at
        // module load, before this effect runs; see GoogleAuthCallback.jsx.
        const redirectUri = window.location.origin + window.location.pathname;

        const keycloakInstance = new Keycloak({
            url: keycloakConfig.url,
            realm: keycloakConfig.realm,
            clientId: keycloakConfig.clientId
        });

        keycloakInstance.onTokenExpired = () => {
            keycloakInstance.updateToken(30).catch((error) => {
                log.error('[KeycloakProvider] Token refresh failed', error);
            });
        };

        keycloakInstance.onAuthError = (errorData) => {
            void authService.authFailure(errorData?.error ?? 'unknown_auth_error');
        };

        keycloakInstance.onAuthRefreshError = () => {
            /*
             * keycloak-js fires this for every failed refresh, including a transient network
             * blip on any ordinary API call (updateToken is called on every request via
             * AuthService.getAccessToken) - not just a genuinely dead refresh token. It only
             * clears the in-memory token, and - since onLoad is 'login-required' - triggers
             * its own login() redirect, when the refresh token itself was actually rejected
             * (a 400/invalid_grant). Only react to that case; a transient failure just retries
             * on the next scheduled refresh.
             */
            if (!keycloakInstance.token) {
                toast.error('Your session expired. Please sign in again.');
            }
        };

        keycloakInstance
            .init({
                onLoad: 'login-required',
                pkceMethod: 'S256',
                checkLoginIframe: false,
                redirectUri,
            })
            .then(async (authenticationResult) => {
                setAuthenticated(!!authenticationResult);
                setKeycloak(keycloakInstance);

                if (!authenticationResult) {
                    return;
                }

                // Load user profile if authenticated
                try {
                    const userProfile = await keycloakInstance.loadUserInfo();
                    setUser(userProfile);
                } catch (error) {
                    log.error('[KeycloakProvider] Failed to load user info', error);
                    toast.error('Failed to load user profile');
                }
            })
            .catch((error) => {
                log.error('[KeycloakProvider] Initialization failed', error);
                toast.error('Authentication initialization failed. Please refresh the page.');
                setKeycloak(keycloakInstance);
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    // Set up token refresh interval only when authenticated
    useEffect(() => {
        if (!authenticated || !keycloak) {
            return;
        }

        const tokenRefreshInterval = setInterval(() => {
            keycloak
                .updateToken(70)
                .catch((refreshError) => {
                    log.warn('[KeycloakProvider] Token refresh failed; will retry on next tick', refreshError);
                });
        }, 30000); // 30 seconds - tighter margin against timer drift/jitter

        // Cleanup interval on unmount or when authenticated changes
        return () => {
            clearInterval(tokenRefreshInterval);
        };
    }, [authenticated, keycloak]);

    /*
     * A backgrounded tab's timers stall or get throttled, so onTokenExpired and the interval
     * above can both miss their window while the tab is hidden. Refreshing the moment the tab
     * is resumed catches the token before the refresh token itself ages out of Keycloak's SSO
     * Session Idle window.
     */
    useEffect(() => {
        if (!authenticated || !keycloak) {
            return;
        }

        return observePageResumed(() => {
            keycloak.updateToken(30).catch((refreshError) => {
                log.warn('[KeycloakProvider] Resume-triggered token refresh failed', refreshError);
            });
        });
    }, [authenticated, keycloak]);

    // Login method
    const login = () => {
        if (keycloak) {
            keycloak.login({
                redirectUri: window.location.origin,
            });
        }
    };

    // Logout method
    const logout = () => {
        if (keycloak) {
            keycloak.logout({
                redirectUri: window.location.origin,
            });
        }
    };

    // Get current access token
    const getToken = () => {
        return keycloak?.token || null;
    };

    const hasRole = (roleName) => user?.roles?.includes(roleName) ?? false;

    const contextValue = {
        keycloak,
        authenticated,
        loading,
        user,
        login,
        logout,
        getToken,
        hasRole,
    };

    return (
        <KeycloakContext.Provider value={contextValue}>
            {children}
        </KeycloakContext.Provider>
    );
};

KeycloakProvider.propTypes = {
    children: PropTypes.node.isRequired,
};

/**
 * useKeycloak Hook
 *
 * Custom hook to access Keycloak context.
 * Returns authentication state and methods.
 */
export const useKeycloak = () => {
    const context = useContext(KeycloakContext);

    if (!context) {
        throw new Error('useKeycloak must be used within a KeycloakProvider');
    }

    return context;
};
