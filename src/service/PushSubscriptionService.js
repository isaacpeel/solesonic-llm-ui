import log from 'loglevel';
import apiClient, {ApiError} from '../client/ApiClient.js';
import authService from './AuthService.js';
import config from '../properties/ApplicationProperties';
import {base64UrlToUint8Array, bufferToBase64Url} from '../util/base64Url.js';

export const PUSH_DISABLED_CODE = 'PUSH_DISABLED';
export const UNSUPPORTED_BROWSER_CODE = 'UNSUPPORTED_BROWSER';
export const INVALID_SUBSCRIPTION_CODE = 'INVALID_SUBSCRIPTION';
export const SUBSCRIPTION_GONE_CODE = 'SUBSCRIPTION_GONE';
export const DELIVERY_FAILED_CODE = 'DELIVERY_FAILED';

const DEVICE_STATE_KEY = 'push.device';
const SERVICE_WORKER_PATH = '/service-worker.js';
const MAXIMUM_LABEL_LENGTH = 128;
const LOGOUT_RELEASE_TIMEOUT_MILLISECONDS = 3000;

const readDeviceState = () => {
    try {
        const storedState = JSON.parse(localStorage.getItem(DEVICE_STATE_KEY));

        return storedState && typeof storedState === 'object' ? storedState : {};
    } catch (storageError) {
        log.warn('[PushSubscriptionService] Device state is unreadable', storageError);
        return {unreadable: true};
    }
};

const writeDeviceState = (deviceState) => {
    try {
        localStorage.setItem(DEVICE_STATE_KEY, JSON.stringify(deviceState));
    } catch (storageError) {
        log.warn('[PushSubscriptionService] Device state could not be saved', storageError);
    }
};

const clearDeviceState = () => {
    try {
        localStorage.removeItem(DEVICE_STATE_KEY);
    } catch (storageError) {
        log.warn('[PushSubscriptionService] Device state could not be cleared', storageError);
    }
};

const userUri = (userId) => `${config.usersUri}/${encodeURIComponent(userId)}`;

const subscriptionsUri = async () => `${userUri(await authService.getUserId())}/push-subscriptions`;

const subscriptionUri = async (subscriptionId) => `${await subscriptionsUri()}/${encodeURIComponent(subscriptionId)}`;

const preferencesUri = async () => `${userUri(await authService.getUserId())}/push-preferences`;

const hasApiErrorCode = (caughtError, code) => caughtError instanceof ApiError && caughtError.code === code;

const isSupported = () => typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && window.isSecureContext === true
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;

const permissionState = () => (typeof Notification === 'undefined' ? 'default' : Notification.permission);

const deviceLabel = () => {
    const platform = navigator.userAgentData?.platform;

    return (platform ? `Chrome on ${platform}` : 'Chrome').slice(0, MAXIMUM_LABEL_LENGTH);
};

const isSubscribedWithKey = (subscription, publicKey) => {
    const subscribedKey = subscription.options?.applicationServerKey;

    return !!subscribedKey && bufferToBase64Url(subscribedKey) === publicKey.replace(/=+$/, '');
};

const registerServiceWorker = async () => {
    await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {scope: '/'});

    return await navigator.serviceWorker.ready;
};

const subscribeWithKey = async (registration, publicKey) => {
    const existingSubscription = await registration.pushManager.getSubscription();

    if (existingSubscription && isSubscribedWithKey(existingSubscription, publicKey)) {
        return existingSubscription;
    }

    if (existingSubscription) {
        await existingSubscription.unsubscribe();
    }

    return await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey),
    });
};

const unsubscribeQuietly = async (subscription) => {
    try {
        await subscription?.unsubscribe();
    } catch (unsubscribeError) {
        log.warn('[PushSubscriptionService] Could not unsubscribe', unsubscribeError);
    }
};

const findThisDeviceSubscription = async () => {
    if (!isSupported()) {
        return null;
    }

    const registration = await navigator.serviceWorker.getRegistration('/');

    return (await registration?.pushManager.getSubscription()) ?? null;
};

const unsubscribeThisDevice = async () => {
    try {
        await unsubscribeQuietly(await findThisDeviceSubscription());
    } catch (caughtError) {
        log.warn('[PushSubscriptionService] Could not read this device\'s subscription', caughtError);
    }
};

const uploadSubscription = async (subscription) => {
    const userId = await authService.getUserId();

    try {
        const summary = await apiClient.put(await subscriptionsUri(), {
            subscription: subscription.toJSON(),
            label: deviceLabel(),
        });

        writeDeviceState({subscriptionId: summary?.id ?? null, enabledForUser: userId});

        return summary;
    } catch (caughtError) {
        if (hasApiErrorCode(caughtError, UNSUPPORTED_BROWSER_CODE)) {
            await unsubscribeQuietly(subscription);
            clearDeviceState();
        }

        throw caughtError;
    }
};

const subscribeThisDevice = async (publicKey) => {
    const registration = await registerServiceWorker();

    return await uploadSubscription(await subscribeWithKey(registration, publicKey));
};

const removeServerSubscription = async (subscriptionId) => {
    if (!subscriptionId) {
        return;
    }

    try {
        await pushSubscriptionService.deleteSubscription(subscriptionId);
    } catch (caughtError) {
        if (!(caughtError instanceof ApiError && caughtError.status === 404)) {
            throw caughtError;
        }
    }
};

const retryStaleServerSubscription = async (subscriptionId) => {
    try {
        await removeServerSubscription(subscriptionId);
    } catch (caughtError) {
        log.warn('[PushSubscriptionService] Could not remove a stale subscription', caughtError);
    }
};

let syncInFlight = null;

const syncThisDevice = async () => {
    try {
        if (!isSupported() || permissionState() !== 'granted') {
            return;
        }

        const publicKey = await pushSubscriptionService.fetchPublicKey();
        const deviceState = readDeviceState();

        if (!publicKey || deviceState.unreadable) {
            return;
        }

        const userId = await authService.getUserId();
        const registration = await registerServiceWorker();
        const existingSubscription = await registration.pushManager.getSubscription();

        if (!userId || deviceState.enabledForUser !== userId) {
            if (existingSubscription) {
                await unsubscribeQuietly(existingSubscription);
                clearDeviceState();
            }

            return;
        }

        if (!existingSubscription && deviceState.subscriptionId) {
            await retryStaleServerSubscription(deviceState.subscriptionId);
        }

        await uploadSubscription(await subscribeWithKey(registration, publicKey));
    } catch (caughtError) {
        log.warn('[PushSubscriptionService] Could not sync this device\'s subscription', caughtError);
    }
};

const withTimeout = (promise, milliseconds) => {
    let timeoutId;
    const timeout = new Promise((resolve) => {
        timeoutId = setTimeout(resolve, milliseconds);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

const pushSubscriptionService = {
    isSupported,

    permissionState,

    registerServiceWorker,

    hasActiveSubscription: async () => {
        try {
            return Boolean(await findThisDeviceSubscription());
        } catch (caughtError) {
            log.warn('[PushSubscriptionService] Could not read this device\'s subscription', caughtError);
            return false;
        }
    },

    deviceSubscriptionId: () => readDeviceState().subscriptionId ?? null,

    fetchPublicKey: async () => {
        try {
            const response = await apiClient.get(`${config.pushUri}/vapid-public-key`);

            return response?.publicKey ?? null;
        } catch (caughtError) {
            if (hasApiErrorCode(caughtError, PUSH_DISABLED_CODE)) {
                return null;
            }

            throw caughtError;
        }
    },

    enableOnThisDevice: async () => {
        const permission = await Notification.requestPermission();

        if (permission !== 'granted') {
            return {permission, subscription: null};
        }

        const publicKey = await pushSubscriptionService.fetchPublicKey();

        if (!publicKey) {
            throw new ApiError({
                message: 'Push notifications are disabled on this server',
                status: 503,
                code: PUSH_DISABLED_CODE,
            });
        }

        return {permission, subscription: await subscribeThisDevice(publicKey)};
    },

    syncOnLoad: () => {
        syncInFlight = syncThisDevice().finally(() => {
            syncInFlight = null;
        });

        return syncInFlight;
    },

    whenSynced: () => syncInFlight ?? Promise.resolve(),

    disableOnThisDevice: async () => {
        const {subscriptionId} = readDeviceState();

        await removeServerSubscription(subscriptionId);
        await unsubscribeThisDevice();
        clearDeviceState();
    },

    releaseOnLogout: async () => {
        const release = async () => {
            const {subscriptionId, enabledForUser} = readDeviceState();

            await unsubscribeThisDevice();
            await removeServerSubscription(subscriptionId);
            writeDeviceState({subscriptionId: null, enabledForUser: enabledForUser ?? null});
        };

        try {
            await withTimeout(release(), LOGOUT_RELEASE_TIMEOUT_MILLISECONDS);
        } catch (caughtError) {
            log.warn('[PushSubscriptionService] Could not release this device on logout', caughtError);
        }
    },

    listSubscriptions: async () => {
        return await apiClient.get(await subscriptionsUri());
    },

    deleteSubscription: async (subscriptionId) => {
        return await apiClient.delete(await subscriptionUri(subscriptionId));
    },

    sendTest: async (subscriptionId) => {
        try {
            await apiClient.post(`${await subscriptionUri(subscriptionId)}/test`);

            return {reRegistered: false, subscription: null};
        } catch (caughtError) {
            if (!hasApiErrorCode(caughtError, SUBSCRIPTION_GONE_CODE)) {
                throw caughtError;
            }

            await unsubscribeThisDevice();

            const publicKey = await pushSubscriptionService.fetchPublicKey();

            if (!publicKey) {
                throw caughtError;
            }

            return {reRegistered: true, subscription: await subscribeThisDevice(publicKey)};
        }
    },

    getPreferences: async () => {
        return await apiClient.get(await preferencesUri());
    },

    updatePreferences: async ({turnComplete, elicitation, interestOffers, interestUpdates}) => {
        const preferences = {turnComplete, elicitation};

        if (interestOffers !== undefined) {
            preferences.interestOffers = interestOffers;
        }

        if (interestUpdates !== undefined) {
            preferences.interestUpdates = interestUpdates;
        }

        return await apiClient.put(await preferencesUri(), preferences);
    },
};

export default pushSubscriptionService;
