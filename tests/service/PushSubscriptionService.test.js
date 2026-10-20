import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('../../src/client/ApiClient.js', async (importOriginal) => ({
    ...await importOriginal(),
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getUserId: vi.fn(),
    },
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {
        apiBaseUri: 'https://api.example.com',
        usersUri: 'https://api.example.com/users',
        pushUri: 'https://api.example.com/push',
    },
}));

import pushSubscriptionService, {
    PUSH_DISABLED_CODE,
    SUBSCRIPTION_GONE_CODE,
    UNSUPPORTED_BROWSER_CODE,
} from '../../src/service/PushSubscriptionService.js';
import apiClient, {ApiError} from '../../src/client/ApiClient.js';
import authService from '../../src/service/AuthService.js';
import {bufferToBase64Url} from '../../src/util/base64Url.js';

const SERVER_KEY_BYTES = Uint8Array.from({length: 65}, (value, index) => (index === 0 ? 4 : index));
const OTHER_KEY_BYTES = Uint8Array.from({length: 65}, (value, index) => (index === 0 ? 4 : 255 - index));
const SERVER_KEY = bufferToBase64Url(SERVER_KEY_BYTES);
const SUBSCRIPTIONS_URI = 'https://api.example.com/users/user-7/push-subscriptions';
const DEVICE_STATE_KEY = 'push.device';

let storedItems;
let currentSubscription;
let pushManager;
let notification;

function fakeSubscription({applicationServerKey = SERVER_KEY_BYTES.buffer, endpoint = 'https://fcm.googleapis.com/fcm/send/abc'} = {}) {
    const subscription = {
        endpoint,
        options: {applicationServerKey},
        toJSON: vi.fn(() => ({endpoint, expirationTime: null, keys: {p256dh: 'p256dh-key', auth: 'auth-secret'}})),
        unsubscribe: vi.fn(async () => {
            if (currentSubscription === subscription) {
                currentSubscription = null;
            }

            return true;
        }),
    };

    return subscription;
}

function stubBrowser({permission = 'granted', requestedPermission = 'granted', platform = 'Android', secureContext = true} = {}) {
    pushManager = {
        getSubscription: vi.fn(async () => currentSubscription),
        subscribe: vi.fn(async () => {
            currentSubscription = fakeSubscription({endpoint: 'https://fcm.googleapis.com/fcm/send/fresh'});
            return currentSubscription;
        }),
    };

    const registration = {pushManager};

    notification = {permission, requestPermission: vi.fn(async () => requestedPermission)};

    function PushManager() {
    }

    vi.stubGlobal('Notification', notification);
    vi.stubGlobal('PushManager', PushManager);
    vi.stubGlobal('window', {isSecureContext: secureContext, Notification: notification, PushManager});
    vi.stubGlobal('navigator', {
        userAgentData: platform ? {platform} : undefined,
        serviceWorker: {
            register: vi.fn().mockResolvedValue(registration),
            ready: Promise.resolve(registration),
            getRegistration: vi.fn().mockResolvedValue(registration),
        },
    });
}

function storeDeviceState(deviceState) {
    storedItems.set(DEVICE_STATE_KEY, JSON.stringify(deviceState));
}

function readStoredDeviceState() {
    return JSON.parse(storedItems.get(DEVICE_STATE_KEY) ?? 'null');
}

function apiError(status, code) {
    return new ApiError({message: `${status}: ${code}`, status, method: 'GET', uri: 'https://api.example.com', code});
}

beforeEach(() => {
    storedItems = new Map();
    currentSubscription = null;

    vi.stubGlobal('localStorage', {
        getItem: vi.fn((key) => (storedItems.has(key) ? storedItems.get(key) : null)),
        setItem: vi.fn((key, value) => storedItems.set(key, value)),
        removeItem: vi.fn((key) => storedItems.delete(key)),
    });

    stubBrowser();

    authService.getUserId.mockResolvedValue('user-7');
    apiClient.get.mockResolvedValue({publicKey: SERVER_KEY});
    apiClient.put.mockResolvedValue({id: 'subscription-1', label: 'Chrome on Android'});
    apiClient.post.mockResolvedValue(null);
    apiClient.delete.mockResolvedValue(null);
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('PushSubscriptionService support', () => {
    it('is supported in a secure context with service workers, PushManager and Notification', () => {
        expect(pushSubscriptionService.isSupported()).toBe(true);
    });

    it('is unsupported outside a secure context', () => {
        stubBrowser({secureContext: false});

        expect(pushSubscriptionService.isSupported()).toBe(false);
    });

    it('is unsupported without PushManager', () => {
        vi.stubGlobal('window', {isSecureContext: true, Notification: notification});

        expect(pushSubscriptionService.isSupported()).toBe(false);
    });

    it('reports the notification permission', () => {
        stubBrowser({permission: 'denied'});

        expect(pushSubscriptionService.permissionState()).toBe('denied');
    });
});

describe('PushSubscriptionService.fetchPublicKey', () => {
    it('reads the VAPID public key', async () => {
        await expect(pushSubscriptionService.fetchPublicKey()).resolves.toBe(SERVER_KEY);
        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/push/vapid-public-key');
    });

    it('returns null when push is disabled on the server', async () => {
        apiClient.get.mockRejectedValue(apiError(503, PUSH_DISABLED_CODE));

        await expect(pushSubscriptionService.fetchPublicKey()).resolves.toBeNull();
    });

    it('rethrows any other failure', async () => {
        apiClient.get.mockRejectedValue(apiError(500, 'INTERNAL'));

        await expect(pushSubscriptionService.fetchPublicKey()).rejects.toMatchObject({status: 500});
    });
});

describe('PushSubscriptionService.enableOnThisDevice', () => {
    it('asks for permission before any network call', async () => {
        await pushSubscriptionService.enableOnThisDevice();

        expect(notification.requestPermission.mock.invocationCallOrder[0])
            .toBeLessThan(apiClient.get.mock.invocationCallOrder[0]);
    });

    it('stops when permission is denied', async () => {
        stubBrowser({permission: 'default', requestedPermission: 'denied'});

        const result = await pushSubscriptionService.enableOnThisDevice();

        expect(result).toEqual({permission: 'denied', subscription: null});
        expect(apiClient.get).not.toHaveBeenCalled();
        expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
        expect(apiClient.put).not.toHaveBeenCalled();
    });

    it('subscribes with userVisibleOnly and the decoded server key', async () => {
        await pushSubscriptionService.enableOnThisDevice();

        expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/service-worker.js', {scope: '/'});
        expect(pushManager.subscribe).toHaveBeenCalledTimes(1);

        const subscribeOptions = pushManager.subscribe.mock.calls[0][0];
        expect(subscribeOptions.userVisibleOnly).toBe(true);
        expect(subscribeOptions.applicationServerKey).toBeInstanceOf(Uint8Array);
        expect(Array.from(subscribeOptions.applicationServerKey)).toEqual(Array.from(SERVER_KEY_BYTES));
    });

    it('uploads exactly toJSON() plus the label, and stores the device state', async () => {
        const result = await pushSubscriptionService.enableOnThisDevice();

        expect(apiClient.put).toHaveBeenCalledWith(SUBSCRIPTIONS_URI, {
            subscription: {
                endpoint: 'https://fcm.googleapis.com/fcm/send/fresh',
                expirationTime: null,
                keys: {p256dh: 'p256dh-key', auth: 'auth-secret'},
            },
            label: 'Chrome on Android',
        });
        expect(result).toEqual({permission: 'granted', subscription: {id: 'subscription-1', label: 'Chrome on Android'}});
        expect(readStoredDeviceState()).toEqual({subscriptionId: 'subscription-1', enabledForUser: 'user-7'});
    });

    it('labels the device plain Chrome without a platform, and caps the label at 128 characters', async () => {
        stubBrowser({platform: ''});
        await pushSubscriptionService.enableOnThisDevice();
        expect(apiClient.put.mock.calls[0][1].label).toBe('Chrome');

        stubBrowser({platform: 'x'.repeat(200)});
        await pushSubscriptionService.enableOnThisDevice();
        expect(apiClient.put.mock.calls[1][1].label).toHaveLength(128);
    });

    it('rejects with PUSH_DISABLED when the server has push turned off', async () => {
        apiClient.get.mockRejectedValue(apiError(503, PUSH_DISABLED_CODE));

        await expect(pushSubscriptionService.enableOnThisDevice()).rejects.toMatchObject({code: PUSH_DISABLED_CODE});
        expect(pushManager.subscribe).not.toHaveBeenCalled();
    });

    it('unsubscribes locally and surfaces UNSUPPORTED_BROWSER', async () => {
        apiClient.put.mockRejectedValue(apiError(400, UNSUPPORTED_BROWSER_CODE));

        await expect(pushSubscriptionService.enableOnThisDevice()).rejects.toMatchObject({code: UNSUPPORTED_BROWSER_CODE});

        expect(currentSubscription).toBeNull();
        expect(storedItems.has(DEVICE_STATE_KEY)).toBe(false);
    });
});

describe('PushSubscriptionService.syncOnLoad', () => {
    it('never asks for permission', async () => {
        stubBrowser({permission: 'default'});
        storeDeviceState({subscriptionId: 'subscription-1', enabledForUser: 'user-7'});

        await pushSubscriptionService.syncOnLoad();

        expect(notification.requestPermission).not.toHaveBeenCalled();
        expect(apiClient.get).not.toHaveBeenCalled();
        expect(pushManager.subscribe).not.toHaveBeenCalled();
    });

    it('does nothing when the server has push disabled', async () => {
        apiClient.get.mockRejectedValue(apiError(503, PUSH_DISABLED_CODE));
        currentSubscription = fakeSubscription();

        await pushSubscriptionService.syncOnLoad();

        expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
        expect(apiClient.put).not.toHaveBeenCalled();
    });

    it('(a) resubscribes when the server key has changed', async () => {
        const staleSubscription = fakeSubscription({applicationServerKey: OTHER_KEY_BYTES.buffer});
        currentSubscription = staleSubscription;
        storeDeviceState({subscriptionId: 'subscription-1', enabledForUser: 'user-7'});

        await pushSubscriptionService.syncOnLoad();

        expect(staleSubscription.unsubscribe).toHaveBeenCalledTimes(1);
        expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
        expect(apiClient.put.mock.calls[0][1].subscription.endpoint).toBe('https://fcm.googleapis.com/fcm/send/fresh');
        expect(notification.requestPermission).not.toHaveBeenCalled();
    });

    it('(b) re-uploads an existing subscription without resubscribing', async () => {
        const existingSubscription = fakeSubscription();
        currentSubscription = existingSubscription;
        storeDeviceState({subscriptionId: 'subscription-1', enabledForUser: 'user-7'});

        await pushSubscriptionService.syncOnLoad();

        expect(pushManager.subscribe).not.toHaveBeenCalled();
        expect(existingSubscription.unsubscribe).not.toHaveBeenCalled();
        expect(apiClient.put).toHaveBeenCalledWith(SUBSCRIPTIONS_URI, expect.objectContaining({
            subscription: expect.objectContaining({endpoint: 'https://fcm.googleapis.com/fcm/send/abc'}),
        }));
        expect(readStoredDeviceState()).toEqual({subscriptionId: 'subscription-1', enabledForUser: 'user-7'});
    });

    it('(c) silently subscribes when this user enabled it on this device before', async () => {
        storeDeviceState({subscriptionId: null, enabledForUser: 'user-7'});

        await pushSubscriptionService.syncOnLoad();

        expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
        expect(apiClient.put).toHaveBeenCalledTimes(1);
        expect(notification.requestPermission).not.toHaveBeenCalled();
    });

    it('does nothing for a different user with no subscription', async () => {
        storeDeviceState({subscriptionId: null, enabledForUser: 'user-other'});

        await pushSubscriptionService.syncOnLoad();

        expect(pushManager.subscribe).not.toHaveBeenCalled();
        expect(apiClient.put).not.toHaveBeenCalled();
    });

    it('unsubscribes a subscription left behind by another user instead of adopting it', async () => {
        const leftoverSubscription = fakeSubscription();
        currentSubscription = leftoverSubscription;
        storeDeviceState({subscriptionId: 'subscription-9', enabledForUser: 'user-other'});

        await pushSubscriptionService.syncOnLoad();

        expect(leftoverSubscription.unsubscribe).toHaveBeenCalledTimes(1);
        expect(apiClient.put).not.toHaveBeenCalled();
        expect(storedItems.has(DEVICE_STATE_KEY)).toBe(false);
    });

    it('unsubscribes a subscription nobody on this device turned on', async () => {
        const unownedSubscription = fakeSubscription();
        currentSubscription = unownedSubscription;

        await pushSubscriptionService.syncOnLoad();

        expect(unownedSubscription.unsubscribe).toHaveBeenCalledTimes(1);
        expect(apiClient.put).not.toHaveBeenCalled();
    });

    it('retries deleting a row a timed-out logout left behind before resubscribing', async () => {
        storeDeviceState({subscriptionId: 'subscription-old', enabledForUser: 'user-7'});

        await pushSubscriptionService.syncOnLoad();

        expect(apiClient.delete).toHaveBeenCalledWith(`${SUBSCRIPTIONS_URI}/subscription-old`);
        expect(apiClient.delete.mock.invocationCallOrder[0]).toBeLessThan(apiClient.put.mock.invocationCallOrder[0]);
    });

    it('lets callers wait for the sync in flight', async () => {
        storeDeviceState({subscriptionId: null, enabledForUser: 'user-7'});

        const syncPromise = pushSubscriptionService.syncOnLoad();
        await pushSubscriptionService.whenSynced();

        expect(readStoredDeviceState()).toEqual({subscriptionId: 'subscription-1', enabledForUser: 'user-7'});
        await syncPromise;
        await expect(pushSubscriptionService.whenSynced()).resolves.toBeUndefined();
    });

    it('swallows failures', async () => {
        storeDeviceState({subscriptionId: 'subscription-1', enabledForUser: 'user-7'});
        currentSubscription = fakeSubscription();
        apiClient.put.mockRejectedValue(new Error('network down'));

        await expect(pushSubscriptionService.syncOnLoad()).resolves.toBeUndefined();
    });
});

describe('PushSubscriptionService.disableOnThisDevice', () => {
    it('deletes the stored subscription, unsubscribes and clears the device state', async () => {
        const existingSubscription = fakeSubscription();
        currentSubscription = existingSubscription;
        storeDeviceState({subscriptionId: 'subscription-1', enabledForUser: 'user-7'});

        await pushSubscriptionService.disableOnThisDevice();

        expect(apiClient.delete).toHaveBeenCalledWith(`${SUBSCRIPTIONS_URI}/subscription-1`);
        expect(existingSubscription.unsubscribe).toHaveBeenCalledTimes(1);
        expect(storedItems.has(DEVICE_STATE_KEY)).toBe(false);
    });

    it('keeps this device subscribed when the server delete fails, so it can be retried', async () => {
        const existingSubscription = fakeSubscription();
        currentSubscription = existingSubscription;
        storeDeviceState({subscriptionId: 'subscription-1', enabledForUser: 'user-7'});
        apiClient.delete.mockRejectedValue(apiError(500, undefined));

        await expect(pushSubscriptionService.disableOnThisDevice()).rejects.toMatchObject({status: 500});

        expect(existingSubscription.unsubscribe).not.toHaveBeenCalled();
        expect(readStoredDeviceState()).toEqual({subscriptionId: 'subscription-1', enabledForUser: 'user-7'});
    });

    it('treats a row the server already removed as done', async () => {
        storeDeviceState({subscriptionId: 'subscription-1', enabledForUser: 'user-7'});
        apiClient.delete.mockRejectedValue(apiError(404, undefined));

        await expect(pushSubscriptionService.disableOnThisDevice()).resolves.toBeUndefined();
    });
});

describe('PushSubscriptionService.releaseOnLogout', () => {
    it('removes the subscription but keeps enabledForUser', async () => {
        const existingSubscription = fakeSubscription();
        currentSubscription = existingSubscription;
        storeDeviceState({subscriptionId: 'subscription-1', enabledForUser: 'user-7'});

        await pushSubscriptionService.releaseOnLogout();

        expect(apiClient.delete).toHaveBeenCalledWith(`${SUBSCRIPTIONS_URI}/subscription-1`);
        expect(existingSubscription.unsubscribe).toHaveBeenCalledTimes(1);
        expect(readStoredDeviceState()).toEqual({subscriptionId: null, enabledForUser: 'user-7'});
    });

    it('resolves within the timeout even when the request hangs', async () => {
        vi.useFakeTimers();
        storeDeviceState({subscriptionId: 'subscription-1', enabledForUser: 'user-7'});
        apiClient.delete.mockReturnValue(new Promise(() => {}));

        const releasePromise = pushSubscriptionService.releaseOnLogout();
        await vi.advanceTimersByTimeAsync(3000);

        await expect(releasePromise).resolves.toBeUndefined();
    });

    it('never rejects, and keeps the subscription id for a later retry when the delete fails', async () => {
        storeDeviceState({subscriptionId: 'subscription-1', enabledForUser: 'user-7'});
        apiClient.delete.mockRejectedValue(new Error('network down'));

        await expect(pushSubscriptionService.releaseOnLogout()).resolves.toBeUndefined();
        expect(readStoredDeviceState()).toEqual({subscriptionId: 'subscription-1', enabledForUser: 'user-7'});
    });
});

describe('PushSubscriptionService.sendTest', () => {
    it('posts to the test endpoint', async () => {
        await expect(pushSubscriptionService.sendTest('subscription-1')).resolves.toEqual({reRegistered: false, subscription: null});
        expect(apiClient.post).toHaveBeenCalledWith(`${SUBSCRIPTIONS_URI}/subscription-1/test`);
    });

    it('re-registers without prompting when the subscription is gone', async () => {
        const goneSubscription = fakeSubscription();
        currentSubscription = goneSubscription;
        apiClient.post.mockRejectedValue(apiError(410, SUBSCRIPTION_GONE_CODE));
        apiClient.put.mockResolvedValue({id: 'subscription-2'});

        const result = await pushSubscriptionService.sendTest('subscription-1');

        expect(goneSubscription.unsubscribe).toHaveBeenCalledTimes(1);
        expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
        expect(notification.requestPermission).not.toHaveBeenCalled();
        expect(result).toEqual({reRegistered: true, subscription: {id: 'subscription-2'}});
        expect(readStoredDeviceState()).toEqual({subscriptionId: 'subscription-2', enabledForUser: 'user-7'});
    });

    it('rethrows other delivery failures', async () => {
        apiClient.post.mockRejectedValue(apiError(502, 'DELIVERY_FAILED'));

        await expect(pushSubscriptionService.sendTest('subscription-1')).rejects.toMatchObject({status: 502});
        expect(pushManager.subscribe).not.toHaveBeenCalled();
    });
});

describe('PushSubscriptionService endpoints', () => {
    it('lists and deletes subscriptions', async () => {
        apiClient.get.mockResolvedValue([]);

        await pushSubscriptionService.listSubscriptions();
        await pushSubscriptionService.deleteSubscription('subscription/1');

        expect(apiClient.get).toHaveBeenCalledWith(SUBSCRIPTIONS_URI);
        expect(apiClient.delete).toHaveBeenCalledWith(`${SUBSCRIPTIONS_URI}/subscription%2F1`);
    });

    it('reads preferences and always writes both fields', async () => {
        apiClient.get.mockResolvedValue({turnComplete: true, elicitation: true});
        apiClient.put.mockResolvedValue({turnComplete: false, elicitation: true});

        await pushSubscriptionService.getPreferences();
        await pushSubscriptionService.updatePreferences({turnComplete: false, elicitation: true, extra: 'ignored'});

        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/users/user-7/push-preferences');
        expect(apiClient.put).toHaveBeenCalledWith(
            'https://api.example.com/users/user-7/push-preferences',
            {turnComplete: false, elicitation: true},
        );
    });
});

describe('PushSubscriptionService device helpers', () => {
    it('reports whether this device holds a subscription', async () => {
        await expect(pushSubscriptionService.hasActiveSubscription()).resolves.toBe(false);

        currentSubscription = fakeSubscription();

        await expect(pushSubscriptionService.hasActiveSubscription()).resolves.toBe(true);
    });

    it('reports no subscription where push is unsupported', async () => {
        stubBrowser({secureContext: false});

        await expect(pushSubscriptionService.hasActiveSubscription()).resolves.toBe(false);
        expect(navigator.serviceWorker.getRegistration).not.toHaveBeenCalled();
    });

    it('reads the stored subscription id', () => {
        storeDeviceState({subscriptionId: 'subscription-1', enabledForUser: 'user-7'});
        expect(pushSubscriptionService.deviceSubscriptionId()).toBe('subscription-1');

        storedItems.clear();
        expect(pushSubscriptionService.deviceSubscriptionId()).toBeNull();
    });
});

describe('PushSubscriptionService with storage unavailable', () => {
    beforeEach(() => {
        const throwingStorage = () => {
            throw new Error('storage disabled');
        };

        vi.stubGlobal('localStorage', {getItem: throwingStorage, setItem: throwingStorage, removeItem: throwingStorage});
    });

    it('still enables, syncs, disables and releases', async () => {
        await expect(pushSubscriptionService.enableOnThisDevice()).resolves.toMatchObject({permission: 'granted'});
        await expect(pushSubscriptionService.syncOnLoad()).resolves.toBeUndefined();
        await expect(pushSubscriptionService.disableOnThisDevice()).resolves.toBeUndefined();
        await expect(pushSubscriptionService.releaseOnLogout()).resolves.toBeUndefined();
    });
});
