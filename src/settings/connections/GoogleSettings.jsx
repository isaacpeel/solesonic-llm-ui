import {useCallback, useEffect, useState} from "react";
import {ArrowsRightLeftIcon, CheckIcon, ExclamationTriangleIcon, XMarkIcon} from "@heroicons/react/24/solid";
import {toast} from "react-toastify";
import log from "loglevel";
import googleAuthService from "../../service/GoogleAuthService.js";
import userPreferencesService from "../../service/UserPreferencesService.js";
import './GoogleSettings.css';

const RECONNECT_MESSAGE = 'Google access is no longer valid. Reconnect your Google account.';

const GoogleSettings = () => {
    const [googleAuthLink, setGoogleAuthLink] = useState(null);
    const [googleAuthentication, setGoogleAuthentication] = useState(null);
    const [googleProfile, setGoogleProfile] = useState(null);
    const [profileMessage, setProfileMessage] = useState('');
    const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);

    const loadProfile = useCallback(async () => {
        try {
            const profile = await googleAuthService.profile();
            setGoogleProfile(profile);
            setProfileMessage('');
        } catch (caughtError) {
            log.error('[GoogleSettings] Failed to load Google profile:', caughtError);
            setGoogleProfile(null);
            setProfileMessage(caughtError.status === 400
                ? RECONNECT_MESSAGE
                : 'Could not read your Google profile right now.');
        }
    }, []);

    const loadConnectionState = useCallback(async () => {
        try {
            const userPreferences = await userPreferencesService.get();
            setGoogleAuthentication(userPreferences.googleAuthentication);

            if (userPreferences.googleAuthentication) {
                await loadProfile();
            } else {
                setGoogleProfile(null);
                setProfileMessage('');
            }
        } catch (caughtError) {
            log.error('[GoogleSettings] Failed to load preferences:', caughtError);
        }
    }, [loadProfile]);

    useEffect(() => {
        googleAuthService.authUri()
            .then((authUri) => {
                setGoogleAuthLink(authUri);
            })
            .catch((caughtError) => {
                log.error('[GoogleSettings] Failed to load auth URI:', caughtError);
            });

        void loadConnectionState();
    }, [loadConnectionState]);

    const handleConnectClick = () => {
        // Google's consent screen is a real page, so this leaves the SPA entirely.
        window.location.href = googleAuthLink.uri;
    };

    const handleDisconnectClick = async () => {
        setDisconnecting(true);

        try {
            await googleAuthService.revoke();
            setGoogleProfile(null);
            setProfileMessage('');
            setGoogleAuthentication(false);
            toast('Google account disconnected');
            await loadConnectionState();
        } catch (caughtError) {
            log.error('[GoogleSettings] Failed to revoke Google access:', caughtError);
            toast.error('Could not disconnect your Google account. Please try again.');
        } finally {
            setDisconnecting(false);
            setConfirmingDisconnect(false);
        }
    };

    return (
        <div className="google-settings-container">
            <div className="google-auth-container">
                <div className="google-settings-item">
                    <div className="google-settings-item-label">
                        Connected:
                    </div>

                    {googleAuthentication ? (
                        <div
                            className="icon-wrapper google-settings-icon-wrapper"
                            data-dialog="Your Google account is connected"
                            data-edge-left=""
                            style={{cursor: 'default'}}
                        >
                            <CheckIcon/>
                        </div>
                    ) : (
                        <div
                            className="icon-wrapper google-settings-icon-wrapper"
                            data-dialog="Your Google account is not connected"
                            data-edge-left=""
                            style={{cursor: 'default'}}
                        >
                            <ExclamationTriangleIcon/>
                        </div>
                    )}
                </div>

                {googleProfile && googleProfile.emailAddress && (
                    <div className="google-settings-account">
                        Connected as {googleProfile.emailAddress}
                    </div>
                )}

                {profileMessage && (
                    <div className="google-settings-message">
                        {profileMessage}
                    </div>
                )}

                <div className="google-settings-item">
                    {googleAuthentication ? (
                        <div className="google-settings-item-label">
                            Reconnect:
                        </div>
                    ) : (
                        <div className="google-settings-item-label">
                            Connect:
                        </div>
                    )}

                    {googleAuthLink ? (
                        <div
                            className="icon-wrapper google-settings-icon-wrapper"
                            onClick={handleConnectClick}
                            data-dialog="Connect Google Account"
                            data-edge-left=""
                        >
                            <ArrowsRightLeftIcon className="icon-button"/>
                        </div>
                    ) : (
                        <span>Loading authentication link...</span>
                    )}
                </div>

                {googleAuthentication && (
                    <div className="google-settings-item">
                        <div className="google-settings-item-label">
                            Disconnect:
                        </div>

                        <div
                            className="icon-wrapper google-settings-icon-wrapper"
                            onClick={() => setConfirmingDisconnect(true)}
                            data-dialog="Disconnect Google Account"
                            data-edge-left=""
                        >
                            <XMarkIcon className="icon-button"/>
                        </div>
                    </div>
                )}
            </div>

            {confirmingDisconnect && (
                <div className="google-settings-confirm">
                    <div className="google-settings-confirm-text">
                        Disconnecting revokes access at Google and removes the stored token. Anything using
                        Gmail on your behalf will stop working until you connect again.
                    </div>
                    <div className="google-settings-confirm-actions">
                        <button
                            type="button"
                            className="google-settings-confirm-button"
                            onClick={handleDisconnectClick}
                            disabled={disconnecting}
                        >
                            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                        </button>
                        <button
                            type="button"
                            className="google-settings-cancel-button"
                            onClick={() => setConfirmingDisconnect(false)}
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

export default GoogleSettings;
