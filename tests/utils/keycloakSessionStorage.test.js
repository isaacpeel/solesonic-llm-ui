import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {
    clearKeycloakSession,
    readKeycloakSession,
    saveKeycloakSession,
} from '../../src/util/keycloakSessionStorage.js';

const STORAGE_KEY = 'solesonic.keycloakSession';

let storedItems;

beforeEach(() => {
    storedItems = new Map();

    vi.stubGlobal('localStorage', {
        getItem: vi.fn((key) => (storedItems.has(key) ? storedItems.get(key) : null)),
        setItem: vi.fn((key, value) => storedItems.set(key, value)),
        removeItem: vi.fn((key) => storedItems.delete(key)),
    });
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('saveKeycloakSession', () => {
    it('persists the access, refresh and id tokens', () => {
        saveKeycloakSession({token: 'access', refreshToken: 'refresh', idToken: 'id'});

        expect(JSON.parse(storedItems.get(STORAGE_KEY))).toEqual({token: 'access', refreshToken: 'refresh', idToken: 'id'});
    });

    it('stores nothing without a refresh token', () => {
        saveKeycloakSession({token: 'access', refreshToken: undefined});

        expect(storedItems.has(STORAGE_KEY)).toBe(false);
    });

    it('survives a storage write failure', () => {
        localStorage.setItem.mockImplementation(() => {
            throw new Error('quota exceeded');
        });

        expect(() => saveKeycloakSession({token: 'access', refreshToken: 'refresh'})).not.toThrow();
    });
});

describe('readKeycloakSession', () => {
    it('returns null with nothing stored', () => {
        expect(readKeycloakSession()).toBeNull();
    });

    it('returns what was saved', () => {
        saveKeycloakSession({token: 'access', refreshToken: 'refresh', idToken: 'id'});

        expect(readKeycloakSession()).toEqual({token: 'access', refreshToken: 'refresh', idToken: 'id'});
    });

    it('discards malformed JSON', () => {
        storedItems.set(STORAGE_KEY, '{not json');

        expect(readKeycloakSession()).toBeNull();
        expect(storedItems.has(STORAGE_KEY)).toBe(false);
    });

    it('discards a stored value missing the refresh token', () => {
        storedItems.set(STORAGE_KEY, JSON.stringify({token: 'access'}));

        expect(readKeycloakSession()).toBeNull();
        expect(storedItems.has(STORAGE_KEY)).toBe(false);
    });

    it('returns null when storage is unavailable', () => {
        vi.stubGlobal('localStorage', undefined);

        expect(readKeycloakSession()).toBeNull();
    });
});

describe('clearKeycloakSession', () => {
    it('removes the stored session', () => {
        saveKeycloakSession({token: 'access', refreshToken: 'refresh'});

        clearKeycloakSession();

        expect(storedItems.has(STORAGE_KEY)).toBe(false);
    });
});
