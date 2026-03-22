import {describe, it, expect} from 'vitest';
import {generateMessageKey} from '../../src/utils/keys.js';

describe('generateMessageKey', () => {
    it('returns string with prefix', () => {
        const generatedKey = generateMessageKey('user');

        expect(generatedKey.startsWith('user-')).toBe(true);
    });

    it('unique keys', () => {
        const firstGeneratedKey = generateMessageKey('user');
        const secondGeneratedKey = generateMessageKey('user');

        expect(firstGeneratedKey).not.toBe(secondGeneratedKey);
    });
});
