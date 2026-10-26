import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {readGameSoundsEnabled, writeGameSoundsEnabled} from '../../src/util/soundPreferences.js';

function createFakeStorage() {
    const storedValues = new Map();

    return {
        getItem: vi.fn((key) => (storedValues.has(key) ? storedValues.get(key) : null)),
        setItem: vi.fn((key, value) => storedValues.set(key, String(value))),
    };
}

function createThrowingStorage() {
    return {
        getItem: vi.fn(() => {
            throw new Error('storage blocked');
        }),
        setItem: vi.fn(() => {
            throw new Error('storage blocked');
        }),
    };
}

describe('soundPreferences', () => {
    beforeEach(() => {
        vi.stubGlobal('localStorage', createFakeStorage());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('defaults to game sounds on when nothing is stored', () => {
        expect(readGameSoundsEnabled()).toBe(true);
    });

    it('reads back a stored off', () => {
        writeGameSoundsEnabled(false);

        expect(readGameSoundsEnabled()).toBe(false);
    });

    it('reads back a stored on after an off', () => {
        writeGameSoundsEnabled(false);
        writeGameSoundsEnabled(true);

        expect(readGameSoundsEnabled()).toBe(true);
    });

    it('falls back to on when storage throws', () => {
        vi.stubGlobal('localStorage', createThrowingStorage());

        expect(readGameSoundsEnabled()).toBe(true);
    });

    it('does not throw when storage refuses a write', () => {
        vi.stubGlobal('localStorage', createThrowingStorage());

        expect(() => writeGameSoundsEnabled(false)).not.toThrow();
    });
});
