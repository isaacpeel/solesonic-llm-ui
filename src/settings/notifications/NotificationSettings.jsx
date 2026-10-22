import {useCallback, useEffect, useRef, useState} from "react";
import {FiAlertCircle} from "react-icons/fi";
import log from "loglevel";
import {toast} from "react-toastify";

import pushSubscriptionService, {
    DELIVERY_FAILED_CODE,
    PUSH_DISABLED_CODE,
    UNSUPPORTED_BROWSER_CODE,
} from "../../service/PushSubscriptionService.js";
import {formatRelativeTime} from "../../util/relativeTime.js";
import "./NotificationSettings.css";

const DEVICE_STATES = {
    CHECKING: "checking",
    SERVER_DISABLED: "serverDisabled",
    UNSUPPORTED: "unsupported",
    UNSUPPORTED_BROWSER: "unsupportedBrowser",
    DENIED: "denied",
    OFF: "off",
    ON: "on",
};

const PREFERENCE_TOGGLES = [
    {key: "turnComplete", label: "A reply is ready"},
    {key: "elicitation", label: "A tool needs my answer"},
    {key: "interestOffers", label: "Suggestions to follow an interest"},
    {key: "interestUpdates", label: "News on interests I follow"},
];

const DEFAULT_PREFERENCES = {turnComplete: true, elicitation: true, interestOffers: true, interestUpdates: true};

const LOAD_FAILED_MESSAGE = "Could not load your notification settings.";

const resolveDeviceState = async () => {
    if (!pushSubscriptionService.isSupported()) {
        return DEVICE_STATES.UNSUPPORTED;
    }

    const permission = pushSubscriptionService.permissionState();

    if (permission === "denied") {
        return DEVICE_STATES.DENIED;
    }

    if (permission === "granted" && await pushSubscriptionService.hasActiveSubscription()) {
        return DEVICE_STATES.ON;
    }

    return DEVICE_STATES.OFF;
};

const describeLastDelivered = (lastDelivered) => {
    const relativeTime = lastDelivered ? formatRelativeTime(new Date(lastDelivered)) : null;

    return `Last notified: ${relativeTime ?? "never"}`;
};

const deleteSubscriptionUnlessGone = async (subscriptionId) => {
    try {
        await pushSubscriptionService.deleteSubscription(subscriptionId);
    } catch (caughtError) {
        if (caughtError?.status !== 404) {
            throw caughtError;
        }
    }
};

const NotificationSettings = () => {
    const [deviceState, setDeviceState] = useState(DEVICE_STATES.CHECKING);
    const [devices, setDevices] = useState([]);
    const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
    const [thisDeviceId, setThisDeviceId] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [actionPending, setActionPending] = useState(false);
    const [preferencesSaving, setPreferencesSaving] = useState(false);

    const loadGenerationRef = useRef(0);

    const loadSettings = useCallback(async () => {
        loadGenerationRef.current += 1;
        const generation = loadGenerationRef.current;

        setDeviceState(DEVICE_STATES.CHECKING);
        setLoadFailed(false);

        try {
            await pushSubscriptionService.whenSynced();

            const publicKey = await pushSubscriptionService.fetchPublicKey();

            if (generation !== loadGenerationRef.current) {
                return;
            }

            if (!publicKey) {
                setDeviceState(DEVICE_STATES.SERVER_DISABLED);
                setLoaded(false);
                return;
            }

            const [resolvedDeviceState, foundDevices, foundPreferences] = await Promise.all([
                resolveDeviceState(),
                pushSubscriptionService.listSubscriptions(),
                pushSubscriptionService.getPreferences(),
            ]);

            if (generation !== loadGenerationRef.current) {
                return;
            }

            setDeviceState(resolvedDeviceState);
            setDevices(foundDevices ?? []);
            setPreferences({...DEFAULT_PREFERENCES, ...foundPreferences});
            setThisDeviceId(pushSubscriptionService.deviceSubscriptionId());
            setLoaded(true);
        } catch (caughtError) {
            if (generation !== loadGenerationRef.current) {
                return;
            }

            log.error('[NotificationSettings] Failed to load notification settings', caughtError);
            setDeviceState(DEVICE_STATES.OFF);
            setLoadFailed(true);
        }
    }, []);

    useEffect(() => {
        void loadSettings();
    }, [loadSettings]);

    useEffect(() => {
        return () => {
            loadGenerationRef.current += 1;
        };
    }, []);

    const reloadDevices = async () => {
        try {
            setDevices(await pushSubscriptionService.listSubscriptions() ?? []);
            setThisDeviceId(pushSubscriptionService.deviceSubscriptionId());
        } catch (caughtError) {
            log.warn('[NotificationSettings] Failed to reload devices', caughtError);
        }
    };

    const turnOffThisDevice = async () => {
        const removedDeviceId = thisDeviceId;

        await pushSubscriptionService.disableOnThisDevice();

        setDeviceState(DEVICE_STATES.OFF);
        setThisDeviceId(null);
        setDevices((currentDevices) => currentDevices.filter((device) => device.id !== removedDeviceId));
    };

    const handleTurnOn = async () => {
        setActionPending(true);

        try {
            const {permission} = await pushSubscriptionService.enableOnThisDevice();

            if (permission === "denied") {
                setDeviceState(DEVICE_STATES.DENIED);
                return;
            }

            if (permission !== "granted") {
                return;
            }

            setDeviceState(DEVICE_STATES.ON);
            toast.success("Notifications are on for this device.");
            await reloadDevices();
        } catch (caughtError) {
            if (caughtError?.code === UNSUPPORTED_BROWSER_CODE) {
                setDeviceState(DEVICE_STATES.UNSUPPORTED_BROWSER);
                return;
            }

            if (caughtError?.code === PUSH_DISABLED_CODE) {
                setDeviceState(DEVICE_STATES.SERVER_DISABLED);
                setLoaded(false);
                return;
            }

            log.error('[NotificationSettings] Failed to turn on notifications', caughtError);
            toast.error("Couldn't turn on notifications. Please try again.");
        } finally {
            setActionPending(false);
        }
    };

    const handleSendTest = async () => {
        setActionPending(true);

        try {
            const {reRegistered} = await pushSubscriptionService.sendTest(thisDeviceId);

            if (reRegistered) {
                toast.info("This device had to be registered again. Send another test to check it.");
                await reloadDevices();
                return;
            }

            toast.success("Test sent. It should arrive in a few seconds.");
        } catch (caughtError) {
            log.error('[NotificationSettings] Failed to send a test notification', caughtError);

            if (caughtError?.status === 404) {
                setDeviceState(DEVICE_STATES.OFF);
                toast.error("This device is no longer registered. Turn notifications on again.");
                await reloadDevices();
                return;
            }

            toast.error(caughtError?.code === DELIVERY_FAILED_CODE
                ? "The test couldn't be delivered. Please try again."
                : "Couldn't send a test notification.");
        } finally {
            setActionPending(false);
        }
    };

    const handleTurnOff = async () => {
        setActionPending(true);

        try {
            await turnOffThisDevice();
            toast.success("Notifications are off for this device.");
        } catch (caughtError) {
            log.error('[NotificationSettings] Failed to turn off notifications', caughtError);
            toast.error("Couldn't turn off notifications. Please try again.");
        } finally {
            setActionPending(false);
        }
    };

    const handleRemoveDevice = async (device) => {
        setActionPending(true);

        try {
            if (device.id === thisDeviceId) {
                await turnOffThisDevice();
                return;
            }

            await deleteSubscriptionUnlessGone(device.id);

            setDevices((currentDevices) => currentDevices.filter((candidate) => candidate.id !== device.id));
        } catch (caughtError) {
            log.error('[NotificationSettings] Failed to remove a device', caughtError);
            toast.error(`Couldn't remove ${device.label}. Please try again.`);
        } finally {
            setActionPending(false);
        }
    };

    const handleToggle = async (preferenceKey) => {
        const previousPreferences = preferences;
        const nextPreferences = {...preferences, [preferenceKey]: !preferences[preferenceKey]};

        setPreferences(nextPreferences);
        setPreferencesSaving(true);

        try {
            const savedPreferences = await pushSubscriptionService.updatePreferences(nextPreferences);
            setPreferences({...nextPreferences, ...savedPreferences});
        } catch (caughtError) {
            log.error('[NotificationSettings] Failed to save notification preferences', caughtError);
            setPreferences(previousPreferences);
            toast.error("Couldn't save your notification preferences.");
        } finally {
            setPreferencesSaving(false);
        }
    };

    const renderDeviceCardBody = () => {
        switch (deviceState) {
            case DEVICE_STATES.CHECKING:
                return <div className="notification-spinner" role="status" aria-label="Checking notifications"/>;
            case DEVICE_STATES.SERVER_DISABLED:
                return <p>Notifications aren&apos;t available on this server.</p>;
            case DEVICE_STATES.UNSUPPORTED:
                return <p>This browser can&apos;t receive notifications. Use Chrome.</p>;
            case DEVICE_STATES.UNSUPPORTED_BROWSER:
                return <p>Notifications are supported in Chrome only.</p>;
            case DEVICE_STATES.DENIED:
                return (
                    <>
                        <p>Notifications are blocked for this site, and this page can&apos;t ask again. To allow them:</p>
                        <ol className="notification-steps">
                            <li>Chrome menu → Settings → Site settings → Notifications → this site → Allow</li>
                            <li>On Android, also Settings → Apps → Chrome → Notifications</li>
                        </ol>
                    </>
                );
            case DEVICE_STATES.ON:
                return (
                    <>
                        <p className="notification-device-status-on">On for this device</p>
                        <div className="notification-actions">
                            <button
                                type="button"
                                className="notification-button"
                                disabled={actionPending || !thisDeviceId}
                                onClick={() => void handleSendTest()}
                            >
                                Send test
                            </button>
                            <button
                                type="button"
                                className="notification-button notification-button-quiet"
                                disabled={actionPending}
                                onClick={() => void handleTurnOff()}
                            >
                                Turn off for this device
                            </button>
                        </div>
                    </>
                );
            default:
                return (
                    <>
                        <p>Notifications are off for this device.</p>
                        <div className="notification-actions">
                            <button
                                type="button"
                                className="notification-button notification-button-primary"
                                disabled={actionPending}
                                onClick={() => void handleTurnOn()}
                            >
                                Turn on for this device
                            </button>
                        </div>
                    </>
                );
        }
    };

    const serverDisabled = deviceState === DEVICE_STATES.SERVER_DISABLED;

    return (
        <div className="notification-settings">
            <h2>Notifications</h2>
            <p className="settings-content-subtitle">
                Get a notification when a reply is ready, a tool needs your answer, or there&apos;s news on something you
                follow, even with the app closed.
                Notifications never include what was said.
            </p>

            {loadFailed && (
                <div className="notification-status-message" role="alert">
                    <FiAlertCircle aria-hidden="true"/>
                    {LOAD_FAILED_MESSAGE}
                    <button type="button" className="notification-button" onClick={() => void loadSettings()}>
                        Retry
                    </button>
                </div>
            )}

            <section className={`notification-device-card notification-device-state-${deviceState}`}>
                <h3 className="notification-section-heading">This device</h3>
                {renderDeviceCardBody()}
            </section>

            {loaded && !serverDisabled && (
                <section className="notification-preferences">
                    <h3 className="notification-section-heading">Notify me when</h3>

                    {PREFERENCE_TOGGLES.map(({key, label}) => (
                        <label key={key} className="notification-toggle">
                            <input
                                type="checkbox"
                                checked={Boolean(preferences[key])}
                                disabled={preferencesSaving}
                                onChange={() => void handleToggle(key)}
                            />
                            <span>{label}</span>
                        </label>
                    ))}
                </section>
            )}

            {loaded && !serverDisabled && (
                <section className="notification-devices">
                    <h3 className="notification-section-heading">Your devices</h3>

                    {devices.length === 0 ? (
                        <p className="notification-empty-hint">No devices have notifications turned on.</p>
                    ) : (
                        <ul className="notification-device-list">
                            {devices.map((device) => (
                                <li key={device.id} className="notification-device-row">
                                    <div className="notification-device-details">
                                        <span className="notification-device-label">{device.label}</span>
                                        {device.id === thisDeviceId && (
                                            <span className="notification-device-this-device">This device</span>
                                        )}
                                        <span className="notification-device-last-delivered">
                                            {describeLastDelivered(device.lastDelivered)}
                                        </span>
                                    </div>

                                    <button
                                        type="button"
                                        className="notification-button notification-button-quiet"
                                        aria-label={`Remove ${device.label}`}
                                        disabled={actionPending}
                                        onClick={() => void handleRemoveDevice(device)}
                                    >
                                        Remove
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {!serverDisabled && (
                <details className="notification-help">
                    <summary>Not getting notifications?</summary>
                    <ul>
                        <li>Don&apos;t force-stop Chrome. A stopped Chrome can&apos;t receive anything.</li>
                        <li>Allow Chrome&apos;s notifications in Android settings (Settings → Apps → Chrome → Notifications).</li>
                        <li>On Samsung, Xiaomi and OnePlus phones, set Chrome&apos;s battery usage to Unrestricted.</li>
                        <li>Phones without Google Play services can&apos;t receive them.</li>
                        <li>Install the app (Chrome menu → Add to Home screen) so a tap opens it like an app.</li>
                    </ul>
                </details>
            )}
        </div>
    );
};

export default NotificationSettings;
