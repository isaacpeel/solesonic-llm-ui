import {describe, it, expect} from 'vitest';
import {
    ACCEPTED_IMAGE_ACCEPT_ATTRIBUTE,
    MAX_ATTACHMENTS_PER_MESSAGE,
    MAX_UPLOAD_BYTES,
    MAX_VISION_BYTES,
    formatByteSize,
    inferContentTypeFromFileName,
    validateImageFile,
    withInferredContentType,
} from '../../src/util/imageValidation.js';

function fakeFile({name = 'screenshot.png', type = 'image/png', size = 1024} = {}) {
    return {name, type, size, lastModified: 0};
}

describe('validateImageFile', () => {
    it('accepts each supported content type', () => {
        for (const contentType of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
            const result = validateImageFile(fakeFile({type: contentType}));

            expect(result).toEqual({valid: true, warning: null});
        }
    });

    it('rejects an unsupported content type', () => {
        const result = validateImageFile(fakeFile({name: 'notes.pdf', type: 'application/pdf'}));

        expect(result.valid).toBe(false);
        expect(result.reason).toContain('PNG, JPEG, GIF and WebP');
    });

    it('rejects a missing content type', () => {
        const result = validateImageFile(fakeFile({type: ''}));

        expect(result.valid).toBe(false);
    });

    it('rejects a missing file', () => {
        expect(validateImageFile(null).valid).toBe(false);
    });

    it('accepts a file exactly at the 20MB boundary', () => {
        const result = validateImageFile(fakeFile({size: MAX_UPLOAD_BYTES}));

        expect(result.valid).toBe(true);
    });

    it('rejects a file over 20MB', () => {
        const result = validateImageFile(fakeFile({size: MAX_UPLOAD_BYTES + 1}));

        expect(result.valid).toBe(false);
        expect(result.reason).toContain('20MB');
    });

    it('accepts a file exactly at the 5MB boundary without a warning', () => {
        const result = validateImageFile(fakeFile({size: MAX_VISION_BYTES}));

        expect(result).toEqual({valid: true, warning: null});
    });

    it('warns for a file over 5MB but under 20MB', () => {
        const result = validateImageFile(fakeFile({size: MAX_VISION_BYTES + 1}));

        expect(result.valid).toBe(true);
        expect(result.warning).toContain('5MB');
    });
});

describe('inferContentTypeFromFileName', () => {
    it('infers from each supported extension, case insensitively', () => {
        expect(inferContentTypeFromFileName('a.png')).toBe('image/png');
        expect(inferContentTypeFromFileName('a.JPG')).toBe('image/jpeg');
        expect(inferContentTypeFromFileName('a.jpeg')).toBe('image/jpeg');
        expect(inferContentTypeFromFileName('a.gif')).toBe('image/gif');
        expect(inferContentTypeFromFileName('a.WebP')).toBe('image/webp');
    });

    it('returns null with no extension or an unknown one', () => {
        expect(inferContentTypeFromFileName('screenshot')).toBeNull();
        expect(inferContentTypeFromFileName('notes.pdf')).toBeNull();
        expect(inferContentTypeFromFileName(null)).toBeNull();
    });
});

describe('withInferredContentType', () => {
    it('returns the original file when its type is already accepted', () => {
        const originalFile = fakeFile({type: 'image/png'});

        expect(withInferredContentType(originalFile)).toBe(originalFile);
    });

    it('rebuilds a file with an empty type using the extension', () => {
        class FakeFile {
            constructor(parts, name, options) {
                this.parts = parts;
                this.name = name;
                this.type = options.type;
                this.size = 512;
            }
        }

        const originalGlobalFile = globalThis.File;
        globalThis.File = FakeFile;

        try {
            const typedFile = withInferredContentType(fakeFile({name: 'pasted.png', type: ''}));

            expect(typedFile.type).toBe('image/png');
            expect(typedFile.name).toBe('pasted.png');
        } finally {
            globalThis.File = originalGlobalFile;
        }
    });

    it('returns the original file when nothing can be inferred', () => {
        const originalFile = fakeFile({name: 'mystery', type: ''});

        expect(withInferredContentType(originalFile)).toBe(originalFile);
    });
});

describe('constants and formatting', () => {
    it('exposes an accept attribute covering every supported type', () => {
        expect(ACCEPTED_IMAGE_ACCEPT_ATTRIBUTE).toBe('image/png,image/jpeg,image/gif,image/webp');
    });

    it('caps attachments per message at four', () => {
        expect(MAX_ATTACHMENTS_PER_MESSAGE).toBe(4);
    });

    it('formats byte sizes', () => {
        expect(formatByteSize(512)).toBe('512 B');
        expect(formatByteSize(2048)).toBe('2 KB');
        expect(formatByteSize(5 * 1024 * 1024)).toBe('5.0 MB');
    });
});
