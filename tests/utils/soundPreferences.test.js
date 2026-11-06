import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {
    AGENT_SOUNDS_ENABLED_STORAGE_KEY,
    readAgentSoundsEnabled,
    writeAgentSoundsEnabled,
} from '../../src/util/soundPreferences.js';

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

    it('defaults to agent sounds on when nothing is stored', () => {
        expect(readAgentSoundsEnabled()).toBe(true);
    });

    it('reads back a stored off', () => {
        writeAgentSoundsEnabled(false);

        expect(readAgentSoundsEnabled()).toBe(false);
    });

    it('reads back a stored on after an off', () => {
        writeAgentSoundsEnabled(false);
        writeAgentSoundsEnabled(true);

        expect(readAgentSoundsEnabled()).toBe(true);
    });

    it('keeps the storage key earlier choices were saved under', () => {
        expect(AGENT_SOUNDS_ENABLED_STORAGE_KEY).toBe('solesonic.gameSoundsEnabled');

        localStorage.setItem('solesonic.gameSoundsEnabled', 'false');

        expect(readAgentSoundsEnabled()).toBe(false);
    });

    it('falls back to on when storage throws', () => {
        writeAgentSoundsEnabled(true);
        vi.stubGlobal('localStorage', createThrowingStorage());

        expect(readAgentSoundsEnabled()).toBe(true);
    });

    it('does not throw when storage refuses a write', () => {
        vi.stubGlobal('localStorage', createThrowingStorage());

        expect(() => writeAgentSoundsEnabled(false)).not.toThrow();
    });
});
