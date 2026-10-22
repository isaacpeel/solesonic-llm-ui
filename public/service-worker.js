const NAVIGATE_MESSAGE = 'push:navigate';
const DEFAULT_TITLE = 'Notification';
const DEFAULT_BODY = 'You have a new notification';
const ICON = '/icons/icon-192.png';
const BADGE = '/icons/badge-96.png';
const MAXIMUM_TITLE_LENGTH = 100;
const MAXIMUM_BODY_LENGTH = 200;
const APP_PATH_PATTERN = /^\/(?:chat\/[A-Za-z0-9_-]+|interests\/offers\/[A-Za-z0-9_-]+(?:\?intent=accept)?|settings(?:\/[A-Za-z0-9_-]+)*)?$/;
const MAXIMUM_ACTION_TITLE_LENGTH = 32;
const DEFAULT_MAXIMUM_ACTIONS = 2;
const ENABLE_ACTION = 'enable';
const DISMISS_ACTION = 'dismiss';
const ALLOWED_ACTIONS = new Set([ENABLE_ACTION, DISMISS_ACTION]);
const INTEREST_OFFER_TYPE = 'INTEREST_OFFER';
const ACCEPT_INTENT_QUERY = '?intent=accept';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    event.waitUntil(showPushNotification(readPayload(event)));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === DISMISS_ACTION) {
        return;
    }

    event.waitUntil(openTarget(clickTarget(event.action, event.notification.data)));
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

function clickTarget(action, data) {
    const path = safePath(data?.url);

    if (action === ENABLE_ACTION && data?.type === INTEREST_OFFER_TYPE) {
        return safePath(`${path}${ACCEPT_INTENT_QUERY}`);
    }

    return path;
}

function maximumActions() {
    const platformLimit = typeof Notification === 'undefined' ? undefined : Notification.maxActions;

    return Number.isInteger(platformLimit) ? platformLimit : DEFAULT_MAXIMUM_ACTIONS;
}

function readActions(actions) {
    if (!Array.isArray(actions)) {
        return [];
    }

    return actions
        .filter((candidate) => ALLOWED_ACTIONS.has(candidate?.action)
            && typeof candidate.title === 'string'
            && candidate.title.length > 0)
        .slice(0, maximumActions())
        .map((candidate) => ({action: candidate.action, title: candidate.title.slice(0, MAXIMUM_ACTION_TITLE_LENGTH)}));
}

function showPushNotification(payload) {
    const tag = textOrDefault(payload.tag, undefined);
    const actions = readActions(payload.actions);
    const options = {
        body: textOrDefault(payload.body, DEFAULT_BODY).slice(0, MAXIMUM_BODY_LENGTH),
        tag,
        icon: ICON,
        badge: BADGE,
        data: {url: safePath(payload.url), type: textOrDefault(payload.type, undefined)},
        timestamp: Date.parse(payload.timestamp) || Date.now(),
        renotify: Boolean(tag),
    };

    if (actions.length > 0) {
        options.actions = actions;
    }

    return self.registration.showNotification(textOrDefault(payload.title, DEFAULT_TITLE).slice(0, MAXIMUM_TITLE_LENGTH), options);
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
