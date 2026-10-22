import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook} from '@testing-library/react';
import usePushNavigation, {PUSH_NAVIGATED_EVENT} from '../../src/push/usePushNavigation.js';

let messageListeners;

function postFromWorker(data) {
    messageListeners.forEach((listener) => listener({data}));
}

beforeEach(() => {
    messageListeners = new Set();

    vi.stubGlobal('navigator', {
        serviceWorker: {
            addEventListener: vi.fn((type, listener) => {
                if (type === 'message') {
                    messageListeners.add(listener);
                }
            }),
            removeEventListener: vi.fn((type, listener) => {
                messageListeners.delete(listener);
            }),
        },
    });
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('usePushNavigation', () => {
    it('navigates to the path a notification click asks for', () => {
        const navigate = vi.fn();
        renderHook(() => usePushNavigation(navigate));

        postFromWorker({type: 'push:navigate', url: '/chat/chat-1'});

        expect(navigate).toHaveBeenCalledWith('/chat/chat-1');
    });

    it.each(['https://evil.example/x', '//evil.example', 'javascript:alert(1)', 42])('ignores the unsafe url %s', (url) => {
        const navigate = vi.fn();
        renderHook(() => usePushNavigation(navigate));

        postFromWorker({type: 'push:navigate', url});

        expect(navigate).not.toHaveBeenCalled();
    });

    it('announces the navigation after making it', () => {
        const navigate = vi.fn();
        const navigatedListener = vi.fn();
        window.addEventListener(PUSH_NAVIGATED_EVENT, navigatedListener);
        renderHook(() => usePushNavigation(navigate));

        postFromWorker({type: 'push:navigate', url: '/chat/chat-9'});

        window.removeEventListener(PUSH_NAVIGATED_EVENT, navigatedListener);
        expect(PUSH_NAVIGATED_EVENT).toBe('push:navigated');
        expect(navigatedListener).toHaveBeenCalledTimes(1);
        expect(navigatedListener.mock.calls[0][0].detail).toEqual({url: '/chat/chat-9'});
        expect(navigate.mock.invocationCallOrder[0]).toBeLessThan(navigatedListener.mock.invocationCallOrder[0]);
    });

    it('announces nothing for an unsafe url', () => {
        const navigatedListener = vi.fn();
        window.addEventListener(PUSH_NAVIGATED_EVENT, navigatedListener);
        renderHook(() => usePushNavigation(vi.fn()));

        postFromWorker({type: 'push:navigate', url: '//evil.example'});

        window.removeEventListener(PUSH_NAVIGATED_EVENT, navigatedListener);
        expect(navigatedListener).not.toHaveBeenCalled();
    });

    it('ignores other messages', () => {
        const navigate = vi.fn();
        renderHook(() => usePushNavigation(navigate));

        postFromWorker({type: 'something-else', url: '/chat/chat-1'});
        postFromWorker(null);

        expect(navigate).not.toHaveBeenCalled();
    });

    it('removes its listener on unmount', () => {
        const {unmount} = renderHook(() => usePushNavigation(vi.fn()));

        unmount();

        expect(messageListeners.size).toBe(0);
    });

    it('does nothing where service workers are unavailable', () => {
        vi.stubGlobal('navigator', {});

        expect(() => renderHook(() => usePushNavigation(vi.fn()))).not.toThrow();
    });
});
