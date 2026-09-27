import {describe, it, expect} from 'vitest';
import {
    ACCEPTED_ATTACHMENT_ACCEPT_ATTRIBUTE,
    MAX_ATTACHMENTS_PER_MESSAGE,
    MAX_UPLOAD_BYTES,
    MAX_VISION_BYTES,
    formatByteSize,
    inferContentTypeFromFileName,
    isImageAttachment,
    validateAttachmentFile,
    withInferredContentType,
} from '../../src/util/imageValidation.js';

function fakeFile({name = 'screenshot.png', type = 'image/png', size = 1024} = {}) {
    return {name, type, size, lastModified: 0};
}

describe('validateAttachmentFile', () => {
    it('accepts each supported image content type', () => {
        for (const contentType of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
            const result = validateAttachmentFile(fakeFile({type: contentType}));

            expect(result).toEqual({valid: true, warning: null});
        }
    });

    it('accepts each supported document content type with no vision warning', () => {
        const documentFixtures = [
            {name: 'notes.pdf', type: 'application/pdf'},
            {name: 'notes.txt', type: 'text/plain'},
            {name: 'notes.md', type: 'text/markdown'},
            {name: 'notes.html', type: 'text/html'},
            {name: 'notes.csv', type: 'text/csv'},
            {name: 'notes.xml', type: 'text/xml'},
            {name: 'notes.xml', type: 'application/xml'},
            {name: 'notes.json', type: 'application/json'},
            {name: 'notes.rtf', type: 'application/rtf'},
        ];

        for (const {name, type} of documentFixtures) {
            const result = validateAttachmentFile(fakeFile({name, type, size: MAX_VISION_BYTES + 1}));

            expect(result).toEqual({valid: true, warning: null});
        }
    });

    it('rejects an unsupported content type', () => {
        const result = validateAttachmentFile(fakeFile({name: 'archive.zip', type: 'application/zip'}));

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('That file type is not supported');
    });

    it('rejects a missing content type', () => {
        const result = validateAttachmentFile(fakeFile({type: ''}));

        expect(result.valid).toBe(false);
    });

    it('rejects a missing file', () => {
        expect(validateAttachmentFile(null).valid).toBe(false);
    });

    it('accepts a file exactly at the 20MB boundary', () => {
        const result = validateAttachmentFile(fakeFile({size: MAX_UPLOAD_BYTES}));

        expect(result.valid).toBe(true);
    });

    it('rejects a file over 20MB', () => {
        const result = validateAttachmentFile(fakeFile({size: MAX_UPLOAD_BYTES + 1}));

        expect(result.valid).toBe(false);
        expect(result.reason).toContain('20MB');
    });

    it('accepts an image exactly at the 5MB boundary without a warning', () => {
        const result = validateAttachmentFile(fakeFile({size: MAX_VISION_BYTES}));

        expect(result).toEqual({valid: true, warning: null});
    });

    it('warns for an image over 5MB but under 20MB', () => {
        const result = validateAttachmentFile(fakeFile({size: MAX_VISION_BYTES + 1}));

        expect(result.valid).toBe(true);
        expect(result.warning).toContain('5MB');
    });

    it('does not warn for a document over 5MB but under 20MB', () => {
        const result = validateAttachmentFile(fakeFile({name: 'notes.pdf', type: 'application/pdf', size: MAX_VISION_BYTES + 1}));

        expect(result).toEqual({valid: true, warning: null});
    });
});

describe('inferContentTypeFromFileName', () => {
    it('infers from each supported image extension, case insensitively', () => {
        expect(inferContentTypeFromFileName('a.png')).toBe('image/png');
        expect(inferContentTypeFromFileName('a.JPG')).toBe('image/jpeg');
        expect(inferContentTypeFromFileName('a.jpeg')).toBe('image/jpeg');
        expect(inferContentTypeFromFileName('a.gif')).toBe('image/gif');
        expect(inferContentTypeFromFileName('a.WebP')).toBe('image/webp');
    });

    it('infers from each supported document extension, case insensitively', () => {
        expect(inferContentTypeFromFileName('a.pdf')).toBe('application/pdf');
        expect(inferContentTypeFromFileName('a.TXT')).toBe('text/plain');
        expect(inferContentTypeFromFileName('a.md')).toBe('text/markdown');
        expect(inferContentTypeFromFileName('a.markdown')).toBe('text/markdown');
        expect(inferContentTypeFromFileName('a.html')).toBe('text/html');
        expect(inferContentTypeFromFileName('a.htm')).toBe('text/html');
        expect(inferContentTypeFromFileName('a.csv')).toBe('text/csv');
        expect(inferContentTypeFromFileName('a.xml')).toBe('application/xml');
        expect(inferContentTypeFromFileName('a.json')).toBe('application/json');
        expect(inferContentTypeFromFileName('a.rtf')).toBe('application/rtf');
    });

    it('returns null with no extension or an unknown one', () => {
        expect(inferContentTypeFromFileName('screenshot')).toBeNull();
        expect(inferContentTypeFromFileName('archive.zip')).toBeNull();
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

describe('isImageAttachment', () => {
    it('trusts a known image content type', () => {
        expect(isImageAttachment({contentType: 'image/png', fileName: 'notes.pdf'})).toBe(true);
    });

    it('trusts a known non-image content type', () => {
        expect(isImageAttachment({contentType: 'application/pdf', fileName: 'screenshot.png'})).toBe(false);
    });

    it('falls back to the file name extension when there is no content type', () => {
        expect(isImageAttachment({fileName: 'screenshot.png'})).toBe(true);
        expect(isImageAttachment({fileName: 'notes.pdf'})).toBe(false);
        expect(isImageAttachment({fileName: 'mystery'})).toBe(false);
    });

    it('is false with neither a content type nor a file name', () => {
        expect(isImageAttachment({})).toBe(false);
    });
});

describe('constants and formatting', () => {
    it('exposes an accept attribute covering every supported type', () => {
        expect(ACCEPTED_ATTACHMENT_ACCEPT_ATTRIBUTE).toBe(
            'image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/markdown,text/html,text/csv,text/xml,application/xml,application/json,application/rtf'
        );

        expect(ACCEPTED_ATTACHMENT_ACCEPT_ATTRIBUTE.split(',')).toContain('text/xml');
        expect(ACCEPTED_ATTACHMENT_ACCEPT_ATTRIBUTE.split(',')).toContain('application/xml');
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
