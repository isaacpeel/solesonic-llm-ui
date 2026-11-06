import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import activeTurnRegistry, {ACTIVE_TURN_RETENTION_MILLISECONDS} from '../../src/util/activeTurnRegistry.js';

function makeStorage() {
    const storedValues = new Map();

    return {
        getItem: vi.fn((key) => (storedValues.has(key) ? storedValues.get(key) : null)),
        setItem: vi.fn((key, value) => {
            storedValues.set(key, String(value));
        }),
        removeItem: vi.fn((key) => {
            storedValues.delete(key);
        }),
    };
}

function makeThrowingStorage() {
    return {
        getItem: vi.fn(() => {
            throw new Error('SecurityError');
        }),
        setItem: vi.fn(() => {
            throw new Error('SecurityError');
        }),
        removeItem: vi.fn(() => {
            throw new Error('SecurityError');
        }),
    };
}

const TURN = {runStartedEventId: '1754062831234-0', userMessageId: 'user-message-1'};

describe('activeTurnRegistry', () => {
    beforeEach(() => {
        vi.stubGlobal('sessionStorage', makeStorage());
        activeTurnRegistry.forget('chat-1');
        activeTurnRegistry.forget('chat-2');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('remembers the turn a chat has in flight', () => {
        activeTurnRegistry.remember('chat-1', TURN, 1000);

        expect(activeTurnRegistry.read('chat-1', 2000)).toEqual({...TURN, updatedAt: 1000});
        expect(activeTurnRegistry.read('chat-2', 2000)).toBeNull();
    });

    it('forgets a turn once it has ended', () => {
        activeTurnRegistry.remember('chat-1', TURN, 1000);
        activeTurnRegistry.forget('chat-1');

        expect(activeTurnRegistry.read('chat-1', 2000)).toBeNull();
    });

    it('ignores a turn older than the server keeps its frames', () => {
        activeTurnRegistry.remember('chat-1', TURN, 1000);

        expect(activeTurnRegistry.read('chat-1', 1000 + ACTIVE_TURN_RETENTION_MILLISECONDS + 1)).toBeNull();
    });

    it('survives a reload through session storage', () => {
        activeTurnRegistry.remember('chat-1', TURN, 1000);

        const storedValue = sessionStorage.setItem.mock.calls[sessionStorage.setItem.mock.calls.length - 1][1];
        expect(JSON.parse(storedValue)['chat-1'].runStartedEventId).toBe('1754062831234-0');
    });

    it('treats unreadable stored data as empty', () => {
        sessionStorage.setItem('chat.activeTurns', '{not json');

        expect(activeTurnRegistry.read('chat-1', 2000)).toBeNull();
    });

    it('keeps working in memory when storage is unavailable', () => {
        vi.stubGlobal('sessionStorage', makeThrowingStorage());

        activeTurnRegistry.remember('chat-1', TURN, 1000);

        expect(activeTurnRegistry.read('chat-1', 2000)).toEqual({...TURN, updatedAt: 1000});

        activeTurnRegistry.forget('chat-1');

        expect(activeTurnRegistry.read('chat-1', 2000)).toBeNull();
    });

    it('ignores a turn with no chat id or no run start', () => {
        activeTurnRegistry.remember(null, TURN, 1000);
        activeTurnRegistry.remember('chat-1', {userMessageId: 'user-message-1'}, 1000);

        expect(activeTurnRegistry.read('chat-1', 2000)).toBeNull();
    });
});
