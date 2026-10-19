import {describe, it, expect} from 'vitest';

import {
    formatConfidence,
    isEpoch,
    KIND_SECTIONS,
    MEMORY_KINDS,
    shortId,
} from '../../../src/settings/memory/memoryLabels.js';
import {
    DEFAULT_MEMORY_LEVEL,
    findMemoryLevel,
    visibleMemoryLevels,
} from '../../../src/settings/memory/memoryLevels.js';

const IZZY_BOT_ADMIN = 'izzy-bot-admin';

describe('memoryLabels', () => {
    it('orders sections instruction, preference, fact', () => {
        expect(KIND_SECTIONS.map((section) => section.kind)).toEqual([
            MEMORY_KINDS.INSTRUCTION,
            MEMORY_KINDS.PREFERENCE,
            MEMORY_KINDS.FACT,
        ]);
    });

    it('formats confidence as a whole percentage', () => {
        expect(formatConfidence(0.85)).toBe('85%');
        expect(formatConfidence(1)).toBe('100%');
        expect(formatConfidence(0.333)).toBe('33%');
        expect(formatConfidence(null)).toBeNull();
    });

    it('shortens an id to its first eight characters', () => {
        expect(shortId('3f2a9c1e-77aa-4b2d-9f00-1234567890ab')).toBe('3f2a9c1e');
        expect(shortId(null)).toBe('');
    });

    it('recognizes the epoch seed timestamp', () => {
        expect(isEpoch('1970-01-01T00:00:00Z')).toBe(true);
        expect(isEpoch('2026-10-19T12:00:00Z')).toBe(false);
        expect(isEpoch(null)).toBe(false);
    });
});

describe('memoryLevels', () => {
    it('defaults to the caller\'s own memories', () => {
        expect(DEFAULT_MEMORY_LEVEL).toBe('mine');
        expect(findMemoryLevel('mine').requiresGroup).toBeNull();
        expect(findMemoryLevel('nonsense')).toBeNull();
    });

    it('shows a non-admin only their own level', () => {
        const levels = visibleMemoryLevels(() => false);

        expect(levels.map((level) => level.level)).toEqual(['mine']);
    });

    it('shows an izzy-bot-admin all four levels', () => {
        const levels = visibleMemoryLevels((groupName) => groupName === IZZY_BOT_ADMIN);

        expect(levels.map((level) => level.level)).toEqual(['mine', 'all', 'reflections', 'status']);
    });
});
