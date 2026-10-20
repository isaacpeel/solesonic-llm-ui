const NAVIGATE_MESSAGE = 'push:navigate';
const DEFAULT_TITLE = 'Notification';
const DEFAULT_BODY = 'You have a new notification';
const ICON = '/icons/icon-192.png';
const BADGE = '/icons/badge-96.png';
const MAXIMUM_TITLE_LENGTH = 100;
const MAXIMUM_BODY_LENGTH = 200;
const APP_PATH_PATTERN = /^\/(?:chat\/[A-Za-z0-9_-]+|settings(?:\/[A-Za-z0-9_-]+)*)?$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    event.waitUntil(showPushNotification(readPayload(event)));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(openTarget(safePath(event.notification.data?.url)));
});

// Best effort: Chrome rarely fires this. The app-load sync uploads the new subscription,
// because the worker holds no token and cannot call the API itself.
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil(resubscribe(event.oldSubscription));
});

function readPayload(event) {
    try {
        const payload = event.data?.json();

        return payload && typeof payload === 'object' ? payload : {};
    } catch {
        return {};
    }
}

function textOrDefault(value, fallback) {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function safePath(url) {
    if (typeof url !== 'string' || !APP_PATH_PATTERN.test(url)) {
        return '/';
    }

    try {
        return new URL(url, self.location.origin).origin === self.location.origin ? url : '/';
    } catch {
        return '/';
    }
}

function showPushNotification(payload) {
    const tag = textOrDefault(payload.tag, undefined);

    return self.registration.showNotification(textOrDefault(payload.title, DEFAULT_TITLE).slice(0, MAXIMUM_TITLE_LENGTH), {
        body: textOrDefault(payload.body, DEFAULT_BODY).slice(0, MAXIMUM_BODY_LENGTH),
        tag,
        icon: ICON,
        badge: BADGE,
        data: {url: safePath(payload.url)},
        timestamp: Date.parse(payload.timestamp) || Date.now(),
        renotify: Boolean(tag),
    });
}

function pickWindowClient(windowClients) {
    return windowClients.find((client) => client.focused)
        ?? windowClients.find((client) => client.visibilityState === 'visible')
        ?? windowClients[0];
}

async function openTarget(path) {
    const windowClients = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const windowClient = pickWindowClient(windowClients);

    if (!windowClient) {
        await self.clients.openWindow(path);
        return;
    }

    try {
        await windowClient.focus();
        windowClient.postMessage({type: NAVIGATE_MESSAGE, url: path});
    } catch (focusError) {
        console.warn('[service-worker] Could not focus an open window', focusError);
        await self.clients.openWindow(path);
    }
}

async function resubscribe(oldSubscription) {
    const applicationServerKey = oldSubscription?.options?.applicationServerKey;

    if (!applicationServerKey) {
        return;
    }

    try {
        await self.registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey});
    } catch (subscribeError) {
        console.warn('[service-worker] Could not resubscribe', subscribeError);
    }
}
