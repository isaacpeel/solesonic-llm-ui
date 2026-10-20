import {describe, it, expect} from 'vitest';
import {isSafeAppPath} from '../../src/util/safeAppPath.js';

const ORIGIN = 'https://app.example.com';

describe('isSafeAppPath', () => {
    it.each(['/', '/chat/chat-1', '/settings/notifications'])('accepts the app path %s', (path) => {
        expect(isSafeAppPath(path, ORIGIN)).toBe(true);
    });

    it.each([
        'https://evil.example/x',
        '//evil.example',
        '/\\evil.example',
        'javascript:alert(1)',
        'chat/chat-1',
        '/chat/chat-1?x=1#y',
        '/google/auth/callback?code=forged',
        '/.//evil.example',
        '',
        null,
        undefined,
        42,
    ])('rejects %s', (url) => {
        expect(isSafeAppPath(url, ORIGIN)).toBe(false);
    });
});
