import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('../../src/service/AttachmentService.js', () => ({
    default: {
        attachmentExists: vi.fn(),
    },
}));

import {
    clearAttachmentDraft,
    readAttachmentDraft,
    restoreValidatedAttachmentDraft,
    saveAttachmentDraft,
} from '../../src/util/attachmentDraftStorage.js';
import attachmentService from '../../src/service/AttachmentService.js';

let storedItems;

function readyEntry(overrides = {}) {
    return {
        trayKey: 'tray-1',
        attachmentId: 'attachment-1',
        fileName: 'screenshot.png',
        contentType: 'image/png',
        fileSizeBytes: 1024,
        caption: 'the banner',
        status: 'ready',
        localObjectUrl: 'blob:local-1',
        file: {name: 'screenshot.png'},
        ...overrides,
    };
}

beforeEach(() => {
    storedItems = new Map();

    vi.stubGlobal('sessionStorage', {
        getItem: vi.fn((key) => (storedItems.has(key) ? storedItems.get(key) : null)),
        setItem: vi.fn((key, value) => storedItems.set(key, value)),
        removeItem: vi.fn((key) => storedItems.delete(key)),
    });

    attachmentService.attachmentExists.mockResolvedValue(true);
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('saveAttachmentDraft', () => {
    it('persists only the id-bearing fields, never the bytes', () => {
        saveAttachmentDraft('chat-1', [readyEntry()]);

        const persisted = JSON.parse(storedItems.get('solesonic.attachmentDraft.chat-1'));
        expect(persisted).toEqual([{
            attachmentId: 'attachment-1',
            fileName: 'screenshot.png',
            contentType: 'image/png',
            fileSizeBytes: 1024,
            caption: 'the banner',
        }]);
        expect(persisted[0].localObjectUrl).toBeUndefined();
        expect(persisted[0].file).toBeUndefined();
    });

    it('scopes an unstarted chat under the "new" key', () => {
        saveAttachmentDraft(null, [readyEntry()]);

        expect(storedItems.has('solesonic.attachmentDraft.new')).toBe(true);
    });

    it('skips entries that are not ready or have no id', () => {
        saveAttachmentDraft('chat-1', [
            readyEntry({status: 'uploading'}),
            readyEntry({trayKey: 'tray-2', attachmentId: null}),
        ]);

        expect(storedItems.has('solesonic.attachmentDraft.chat-1')).toBe(false);
    });

    it('removes the key when the tray empties', () => {
        saveAttachmentDraft('chat-1', [readyEntry()]);
        saveAttachmentDraft('chat-1', []);

        expect(storedItems.has('solesonic.attachmentDraft.chat-1')).toBe(false);
    });

    it('survives a storage write failure', () => {
        sessionStorage.setItem.mockImplementation(() => {
            throw new Error('quota exceeded');
        });

        expect(() => saveAttachmentDraft('chat-1', [readyEntry()])).not.toThrow();
    });
});

describe('readAttachmentDraft', () => {
    it('returns an empty array with nothing stored', () => {
        expect(readAttachmentDraft('chat-1')).toEqual([]);
    });

    it('returns an empty array for malformed JSON', () => {
        storedItems.set('solesonic.attachmentDraft.chat-1', '{not json');

        expect(readAttachmentDraft('chat-1')).toEqual([]);
    });

    it('returns an empty array when the stored value is not an array', () => {
        storedItems.set('solesonic.attachmentDraft.chat-1', '{"attachmentId":"a1"}');

        expect(readAttachmentDraft('chat-1')).toEqual([]);
    });
});

describe('clearAttachmentDraft', () => {
    it('removes the stored draft', () => {
        saveAttachmentDraft('chat-1', [readyEntry()]);

        clearAttachmentDraft('chat-1');

        expect(storedItems.has('solesonic.attachmentDraft.chat-1')).toBe(false);
    });
});

describe('restoreValidatedAttachmentDraft', () => {
    it('returns an empty array with no stored draft, without calling the server', async () => {
        await expect(restoreValidatedAttachmentDraft('chat-1')).resolves.toEqual([]);
        expect(attachmentService.attachmentExists).not.toHaveBeenCalled();
    });

    it('returns entries that still exist', async () => {
        saveAttachmentDraft('chat-1', [readyEntry()]);

        const restoredEntries = await restoreValidatedAttachmentDraft('chat-1');

        expect(restoredEntries).toHaveLength(1);
        expect(restoredEntries[0].attachmentId).toBe('attachment-1');
        expect(attachmentService.attachmentExists).toHaveBeenCalledWith('attachment-1');
    });

    it('drops ids the server no longer knows about', async () => {
        saveAttachmentDraft('chat-1', [
            readyEntry(),
            readyEntry({trayKey: 'tray-2', attachmentId: 'attachment-2', fileName: 'gone.png'}),
        ]);

        attachmentService.attachmentExists
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);

        const restoredEntries = await restoreValidatedAttachmentDraft('chat-1');

        expect(restoredEntries).toHaveLength(1);
        expect(restoredEntries[0].attachmentId).toBe('attachment-1');
    });

    it('drops an entry whose revalidation threw', async () => {
        saveAttachmentDraft('chat-1', [readyEntry()]);
        attachmentService.attachmentExists.mockRejectedValue(new Error('network down'));

        await expect(restoreValidatedAttachmentDraft('chat-1')).resolves.toEqual([]);
    });
});
