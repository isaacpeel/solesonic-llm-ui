import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

const ORIGIN = 'https://app.example.com';

let listeners;
let showNotification;
let pushManager;
let clients;

async function loadWorker() {
    listeners = {};
    showNotification = vi.fn().mockResolvedValue(undefined);
    pushManager = {subscribe: vi.fn().mockResolvedValue({})};
    clients = {
        matchAll: vi.fn().mockResolvedValue([]),
        openWindow: vi.fn().mockResolvedValue(null),
        claim: vi.fn().mockResolvedValue(undefined),
    };

    vi.stubGlobal('self', {
        addEventListener: vi.fn((type, listener) => {
            listeners[type] = listener;
        }),
        skipWaiting: vi.fn().mockResolvedValue(undefined),
        registration: {showNotification, pushManager},
        clients,
        location: {origin: ORIGIN},
    });

    vi.resetModules();
    await import('../../public/service-worker.js');
}

async function dispatch(type, event = {}) {
    let pendingWork = Promise.resolve();

    listeners[type]({
        ...event,
        waitUntil: (promise) => {
            pendingWork = promise;
        },
    });

    await pendingWork;
}

function pushEventWith(payload) {
    return {data: {json: () => payload}};
}

function windowClient(overrides = {}) {
    return {
        focused: false,
        visibilityState: 'hidden',
        focus: vi.fn().mockResolvedValue(undefined),
        postMessage: vi.fn(),
        ...overrides,
    };
}

function notificationClickFor(url) {
    return {notification: {close: vi.fn(), data: {url}}};
}

beforeEach(async () => {
    await loadWorker();
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('service worker lifecycle', () => {
    it('activates immediately and claims open pages', async () => {
        await dispatch('install');
        expect(self.skipWaiting).toHaveBeenCalledTimes(1);

        await dispatch('activate');
        expect(clients.claim).toHaveBeenCalledTimes(1);
    });

    it('registers no fetch handler', () => {
        expect(listeners.fetch).toBeUndefined();
    });
});

describe('service worker push', () => {
    it('shows the payload as given', async () => {
        await dispatch('push', pushEventWith({
            version: 1,
            type: 'TURN_FINISHED',
            title: 'Solesonic',
            body: 'Your reply is ready',
            url: '/chat/chat-1',
            tag: 'chat:chat-1',
            timestamp: '2026-10-20T12:00:00Z',
        }));

        expect(showNotification).toHaveBeenCalledWith('Solesonic', {
            body: 'Your reply is ready',
            tag: 'chat:chat-1',
            icon: '/icons/icon-192.png',
            badge: '/icons/badge-96.png',
            data: {url: '/chat/chat-1'},
            timestamp: Date.parse('2026-10-20T12:00:00Z'),
            renotify: true,
        });
    });

    it('shows an unknown type using its title and body', async () => {
        await dispatch('push', pushEventWith({version: 1, type: 'SOMETHING_NEW', title: 'Bot', body: 'New thing', url: '/'}));

        expect(showNotification).toHaveBeenCalledWith('Bot', expect.objectContaining({body: 'New thing'}));
    });

    it('still shows the default notification with no data', async () => {
        await dispatch('push', {data: null});

        expect(showNotification).toHaveBeenCalledWith('Notification', expect.objectContaining({
            body: 'You have a new notification',
            data: {url: '/'},
            renotify: false,
        }));
    });

    it('still shows the default notification for an unparseable payload', async () => {
        await dispatch('push', {
            data: {
                json: () => {
                    throw new SyntaxError('Unexpected token');
                },
            },
        });

        expect(showNotification).toHaveBeenCalledWith('Notification', expect.objectContaining({body: 'You have a new notification'}));
    });

    it('caps an oversized title and body', async () => {
        await dispatch('push', pushEventWith({title: 't'.repeat(500), body: 'b'.repeat(500), url: '/'}));

        expect(showNotification.mock.calls[0][0]).toHaveLength(100);
        expect(showNotification.mock.calls[0][1].body).toHaveLength(200);
    });

    it('stores a safe path even when the payload url is not one', async () => {
        await dispatch('push', pushEventWith({title: 'Bot', body: 'Hi', url: 'https://evil.example/x'}));

        expect(showNotification.mock.calls[0][1].data).toEqual({url: '/'});
    });
});

describe('service worker notificationclick', () => {
    it('focuses an open window and asks it to navigate', async () => {
        const openWindowClient = windowClient();
        clients.matchAll.mockResolvedValue([openWindowClient]);
        const clickEvent = notificationClickFor('/chat/chat-1');

        await dispatch('notificationclick', clickEvent);

        expect(clickEvent.notification.close).toHaveBeenCalledTimes(1);
        expect(clients.matchAll).toHaveBeenCalledWith({type: 'window', includeUncontrolled: true});
        expect(openWindowClient.focus).toHaveBeenCalledTimes(1);
        expect(openWindowClient.postMessage).toHaveBeenCalledWith({type: 'push:navigate', url: '/chat/chat-1'});
        expect(clients.openWindow).not.toHaveBeenCalled();
    });

    it('prefers a focused window, then a visible one', async () => {
        const hiddenClient = windowClient();
        const visibleClient = windowClient({visibilityState: 'visible'});
        const focusedClient = windowClient({focused: true, visibilityState: 'visible'});

        clients.matchAll.mockResolvedValue([hiddenClient, visibleClient, focusedClient]);
        await dispatch('notificationclick', notificationClickFor('/chat/chat-1'));
        expect(focusedClient.postMessage).toHaveBeenCalledTimes(1);
        expect(visibleClient.postMessage).not.toHaveBeenCalled();

        clients.matchAll.mockResolvedValue([hiddenClient, visibleClient]);
        await dispatch('notificationclick', notificationClickFor('/chat/chat-1'));
        expect(visibleClient.postMessage).toHaveBeenCalledTimes(1);
        expect(hiddenClient.postMessage).not.toHaveBeenCalled();
    });

    it('opens a window when none is open', async () => {
        await dispatch('notificationclick', notificationClickFor('/settings/notifications'));

        expect(clients.openWindow).toHaveBeenCalledWith('/settings/notifications');
    });

    it.each([
        'https://evil.example/x',
        '//evil.example',
        '/\\evil.example',
        'javascript:alert(1)',
        'chat/chat-1',
        '/google/auth/callback?code=forged',
        undefined,
    ])('falls back to / for the unsafe target %s', async (unsafeUrl) => {
        await dispatch('notificationclick', notificationClickFor(unsafeUrl));

        expect(clients.openWindow).toHaveBeenCalledWith('/');
    });
});

describe('service worker pushsubscriptionchange', () => {
    it('resubscribes with the previous server key', async () => {
        const applicationServerKey = new Uint8Array([4, 1, 2]).buffer;

        await dispatch('pushsubscriptionchange', {oldSubscription: {options: {applicationServerKey}}});

        expect(pushManager.subscribe).toHaveBeenCalledWith({userVisibleOnly: true, applicationServerKey});
    });

    it('does nothing without a previous key, and swallows failures', async () => {
        await dispatch('pushsubscriptionchange', {oldSubscription: null});
        expect(pushManager.subscribe).not.toHaveBeenCalled();

        pushManager.subscribe.mockRejectedValue(new Error('denied'));
        await expect(dispatch('pushsubscriptionchange', {
            oldSubscription: {options: {applicationServerKey: new Uint8Array([4]).buffer}},
        })).resolves.toBeUndefined();
    });
});
