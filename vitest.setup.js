import { vi } from 'vitest';

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // Deprecated
        removeListener: vi.fn(), // Deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

/*
 * jsdom does not implement ResizeObserver, and the chat history virtualizer constructs one per
 * mounted row to measure it. The stub only has to exist — rows never resize under test, and the
 * virtualizer falls back to its `initialRect` and size estimates.
 */
vi.stubGlobal('ResizeObserver', class ResizeObserverStub {
    observe() {}

    unobserve() {}

    disconnect() {}
});
