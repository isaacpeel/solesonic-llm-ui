import {describe, it, expect} from 'vitest';
import {isSafeAppPath} from '../../src/util/safeAppPath.js';
import {SAFE_APP_PATHS, UNSAFE_APP_PATHS} from '../push/appPathFixtures.js';

const ORIGIN = 'https://app.example.com';

describe('isSafeAppPath', () => {
    it.each(SAFE_APP_PATHS)('accepts the app path %s', (path) => {
        expect(isSafeAppPath(path, ORIGIN)).toBe(true);
    });

    it.each(UNSAFE_APP_PATHS)('rejects %s', (url) => {
        expect(isSafeAppPath(url, ORIGIN)).toBe(false);
    });
});
