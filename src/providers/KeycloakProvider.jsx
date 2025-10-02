import { createContext, useContext, useEffect, useState, useRef } from 'react';
import Keycloak from 'keycloak-js';
import keycloakConfig from '../config/keycloak.js';
import PropTypes from 'prop-types';
import { toast } from 'react-toastify';

// Create Keycloak context
const KeycloakContext = createContext(null);

/**
 * KeycloakProvider Component
 * 
 * Provides Keycloak authentication state and methods to the application.
 * Initializes Keycloak with PKCE (S256) and login-required.
 * Implements automatic token refresh every 60 seconds when authenticated.
 */
export const KeycloakProvider = ({ children }) => {
    const [keycloak, setKeycloak] = useState(null);
    const [authenticated, setAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const didInitRef = useRef(false);

    // Initialize Keycloak exactly once
    useEffect(() => {
        // Prevent double initialization (React StrictMode double-mount guard)
        if (didInitRef.current) {
            console.log('[Keycloak] Init already called, skipping duplicate');
            return;
        }
        didInitRef.current = true;

        console.log('[Keycloak] Init start, location.href:', window.location.href);

        // Initialize Keycloak instance with only constructor params
        const keycloakInstance = new Keycloak({
            url: keycloakConfig.url,
            realm: keycloakConfig.realm,
            clientId: keycloakConfig.clientId
        });

        // Initialize Keycloak with PKCE and login-required
        keycloakInstance
            .init({
                onLoad: 'login-required',
                pkceMethod: 'S256',
                checkLoginIframe: false,
                redirectUri: window.location.origin + '/',
            })
            .then(async (auth) => {
                console.log('[Keycloak] Init done: auth=', auth, 'location.href:', window.location.href);
                setAuthenticated(!!auth);
                setKeycloak(keycloakInstance);

                // Load user profile if authenticated
                if (auth) {
                    try {
                        const userProfile = await keycloakInstance.loadUserProfile();
                        setUser(userProfile);
                        console.log('[Keycloak] User profile loaded:', userProfile.username);
                    } catch (error) {
                        console.error('[Keycloak] Failed to load user profile:', error);
                        toast.error('Failed to load user profile');
                    }
                }

                setLoading(false);
            })
            .catch((error) => {
                console.error('[Keycloak] Initialization failed. Details:', {
                    href: window.location.href,
                    realm: keycloakConfig.realm,
                    clientId: keycloakConfig.clientId,
                    kcUrl: keycloakConfig.url,
                    error: error,
                    stack: error?.stack
                });
                toast.error('Authentication initialization failed. Please refresh the page.');
                setLoading(false);
            });
    }, []);

    // Set up token refresh interval only when authenticated
    useEffect(() => {
        if (!authenticated || !keycloak) {
            return;
        }

        console.log('[Keycloak] Starting token refresh interval');
        const tokenRefreshInterval = setInterval(() => {
            keycloak
                .updateToken(70) // Refresh if token expires within 70 seconds
                .then((refreshed) => {
                    if (refreshed) {
                        console.log('[Keycloak] Token refreshed successfully');
                    }
                })
                .catch((error) => {
                    console.error('[Keycloak] Failed to refresh token:', error);
                    toast.error('Session expired. Please log in again.');
                    keycloak.login({ redirectUri: window.location.origin + '/' });
                });
        }, 60000); // 60 seconds

        // Cleanup interval on unmount or when authenticated changes
        return () => {
            console.log('[Keycloak] Clearing token refresh interval');
            clearInterval(tokenRefreshInterval);
        };
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

    const contextValue = {
        keycloak,
        authenticated,
        loading,
        user,
        login,
        logout,
        getToken,
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
