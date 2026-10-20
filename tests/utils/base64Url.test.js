import {describe, it, expect} from 'vitest';
import {base64UrlToUint8Array, bufferToBase64Url} from '../../src/util/base64Url.js';

const UNCOMPRESSED_POINT_BYTES = Uint8Array.from({length: 65}, (value, index) => (index === 0 ? 4 : (index * 37) % 256));

describe('base64UrlToUint8Array', () => {
    it('round-trips a 65-byte uncompressed P-256 key', () => {
        const encodedKey = bufferToBase64Url(UNCOMPRESSED_POINT_BYTES);
        const decodedKey = base64UrlToUint8Array(encodedKey);

        expect(decodedKey).toBeInstanceOf(Uint8Array);
        expect(decodedKey.length).toBe(65);
        expect(Array.from(decodedKey)).toEqual(Array.from(UNCOMPRESSED_POINT_BYTES));
    });

    it('decodes url-safe characters with the padding missing', () => {
        expect(Array.from(base64UrlToUint8Array('-_8'))).toEqual([0xfb, 0xff]);
        expect(Array.from(base64UrlToUint8Array('AQ'))).toEqual([1]);
    });

    it('accepts input that is already padded', () => {
        expect(Array.from(base64UrlToUint8Array('AQ=='))).toEqual([1]);
    });
});

describe('bufferToBase64Url', () => {
    it('encodes an ArrayBuffer as unpadded base64url', () => {
        expect(bufferToBase64Url(new Uint8Array([0xfb, 0xff]).buffer)).toBe('-_8');
        expect(bufferToBase64Url(new Uint8Array([1]).buffer)).toBe('AQ');
    });
});
