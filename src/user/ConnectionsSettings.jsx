import {useCallback, useEffect, useState} from 'react';
import {ArrowsRightLeftIcon, CheckCircleIcon, ExclamationTriangleIcon} from '@heroicons/react/24/solid';
import {SiAtlassian, SiGoogle} from 'react-icons/si';
import {toast} from 'react-toastify';
import log from 'loglevel';

import atlassianAuthService from '../service/AtlassianAuthService.js';
import googleAuthService from '../service/GoogleAuthService.js';
import userPreferencesService from '../service/UserPreferencesService.js';
import './ConnectionsSettings.css';

const RECONNECT_MESSAGE = 'Google access is no longer valid. Reconnect your Google account.';

const CONNECTION_PROVIDERS = [
    {
        id: 'atlassian',
        name: 'Atlassian',
        Icon: SiAtlassian,
        badgeColor: '#0052CC',
        preferenceKey: 'atlassianAuthentication',
        authService: atlassianAuthService,
        supportsProfile: false,
        supportsRevoke: false
    },
    {
        id: 'google',
        name: 'Google',
        Icon: SiGoogle,
        badgeColor: '#EA4335',
        preferenceKey: 'googleAuthentication',
        authService: googleAuthService,
        supportsProfile: true,
        supportsRevoke: true
    }
];

const ConnectionCard = ({provider, connected, authUri, accountLabel, message, onConnect, onDisconnect}) => {
    const {name, Icon, badgeColor, supportsRevoke} = provider;

    return (
        <div className="connections-card">
            <div className="connections-badge" style={{backgroundColor: badgeColor}}>
                <Icon size={20} color="#ffffff"/>
            </div>

            <div className="connections-body">
                <div className="connections-name">{name}</div>

                {connected ? (
                    <span className="connections-status connections-status-connected">
                        <CheckCircleIcon className="connections-status-icon"/>
                        Connected
                    </span>
                ) : (
                    <span className="connections-status connections-status-disconnected">
                        <ExclamationTriangleIcon className="connections-status-icon"/>
                        Not connected
                    </span>
                )}

                {accountLabel && (
                    <div className="connections-meta">Connected as {accountLabel}</div>
                )}

                {message && (
                    <div className="connections-message">{message}</div>
                )}
            </div>

            <div className="connections-actions">
                <button
                    type="button"
                    className="connections-connect-button"
                    onClick={onConnect}
                    disabled={!authUri}
                >
                    <ArrowsRightLeftIcon className="connections-button-icon"/>
                    {connected ? 'Reconnect' : 'Connect'}
                </button>

                {connected && supportsRevoke && (
                    <button
                        type="button"
                        className="connections-disconnect-link"
                        onClick={onDisconnect}
                    >
                        Disconnect
                    </button>
                )}
            </div>
        </div>
    );
};

const ConnectionsSettings = () => {
    const [connectionState, setConnectionState] = useState({});
    const [authUris, setAuthUris] = useState({});
    const [googleAccount, setGoogleAccount] = useState(null);
    const [googleMessage, setGoogleMessage] = useState('');
    const [confirmingDisconnect, setConfirmingDisconnect] = useState(null);
    const [disconnecting, setDisconnecting] = useState(false);

    const loadGoogleProfile = useCallback(async () => {
        try {
            const profile = await googleAuthService.profile();
            setGoogleAccount(profile?.emailAddress ?? null);
            setGoogleMessage('');
        } catch (caughtError) {
            log.error('[ConnectionsSettings] Failed to load Google profile:', caughtError);
            setGoogleAccount(null);
            setGoogleMessage(caughtError.status === 400
                ? RECONNECT_MESSAGE
                : 'Could not read your Google profile right now.');
        }
    }, []);

    const loadConnectionState = useCallback(async () => {
        try {
            const userPreferences = await userPreferencesService.get();

            setConnectionState(CONNECTION_PROVIDERS.reduce((accumulator, provider) => {
                accumulator[provider.id] = Boolean(userPreferences[provider.preferenceKey]);
                return accumulator;
            }, {}));

            if (userPreferences.googleAuthentication) {
                await loadGoogleProfile();
            } else {
                setGoogleAccount(null);
                setGoogleMessage('');
            }
        } catch (caughtError) {
            log.error('[ConnectionsSettings] Failed to load preferences:', caughtError);
        }
    }, [loadGoogleProfile]);

    useEffect(() => {
        CONNECTION_PROVIDERS.forEach((provider) => {
            provider.authService.authUri()
                .then((authUri) => {
                    setAuthUris((currentAuthUris) => ({...currentAuthUris, [provider.id]: authUri?.uri ?? null}));
                })
                .catch((caughtError) => {
                    log.error(`[ConnectionsSettings] Failed to load ${provider.name} auth URI:`, caughtError);
                });
        });

        void loadConnectionState();
    }, [loadConnectionState]);

    const handleConnect = (providerId) => {
        window.location.href = authUris[providerId];
    };

    const handleDisconnect = async () => {
        setDisconnecting(true);

        try {
            await googleAuthService.revoke();
            setGoogleAccount(null);
            setGoogleMessage('');
            toast('Google account disconnected');
            await loadConnectionState();
        } catch (caughtError) {
            log.error('[ConnectionsSettings] Failed to revoke Google access:', caughtError);
            toast.error('Could not disconnect your Google account. Please try again.');
        } finally {
            setDisconnecting(false);
            setConfirmingDisconnect(null);
        }
    };

    return (
        <div className="connections-container">
            <h2>Connections</h2>
            <p className="settings-content-subtitle">
                Link external accounts to unlock document ingestion and integrations.
            </p>

            {CONNECTION_PROVIDERS.map((provider) => (
                <ConnectionCard
                    key={provider.id}
                    provider={provider}
                    connected={Boolean(connectionState[provider.id])}
                    authUri={authUris[provider.id]}
                    accountLabel={provider.supportsProfile ? googleAccount : null}
                    message={provider.supportsProfile ? googleMessage : ''}
                    onConnect={() => handleConnect(provider.id)}
                    onDisconnect={() => setConfirmingDisconnect(provider.id)}
                />
            ))}

            {confirmingDisconnect === 'google' && (
                <div className="connections-confirm">
                    <div className="connections-confirm-text">
                        Disconnecting revokes access at Google and removes the stored token. Anything using
                        Gmail on your behalf will stop working until you connect again.
                    </div>
                    <div className="connections-confirm-actions">
                        <button
                            type="button"
                            className="connections-confirm-button"
                            onClick={handleDisconnect}
                            disabled={disconnecting}
                        >
                            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                        </button>
                        <button
                            type="button"
                            className="connections-cancel-button"
                            onClick={() => setConfirmingDisconnect(null)}
                            disabled={disconnecting}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConnectionsSettings;
