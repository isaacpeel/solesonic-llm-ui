import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act, waitFor} from '@testing-library/react';

vi.mock('../../src/service/AttachmentService.js', () => ({
    default: {
        stageAttachment: vi.fn(),
        deleteAttachment: vi.fn(),
        attachmentExists: vi.fn(),
    },
}));

/*
 * Drafts and downscaling are exercised by their own suites. Stubbing them here keeps these
 * tests about tray state, and — importantly — stops a draft persisted by one test from being
 * restored into the next through a shared sessionStorage.
 */
vi.mock('../../src/util/attachmentDraftStorage.js', () => ({
    saveAttachmentDraft: vi.fn(),
    clearAttachmentDraft: vi.fn(),
    restoreValidatedAttachmentDraft: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/util/downscaleImage.js', () => ({
    downscaleImage: vi.fn(async (candidateFile) => candidateFile),
}));

vi.mock('../../src/util/attachmentObjectUrlCache.js', () => ({
    primeAttachmentObjectUrl: vi.fn(),
}));

import useAttachmentTray from '../../src/hooks/useAttachmentTray.js';
import attachmentService from '../../src/service/AttachmentService.js';
import {primeAttachmentObjectUrl} from '../../src/util/attachmentObjectUrlCache.js';
import {
    clearAttachmentDraft,
    restoreValidatedAttachmentDraft,
    saveAttachmentDraft,
} from '../../src/util/attachmentDraftStorage.js';
import {downscaleImage} from '../../src/util/downscaleImage.js';

let createdObjectUrlCount;
let revokedObjectUrls;

function fakeFile({name = 'screenshot.png', type = 'image/png', size = 1024} = {}) {
    return {name, type, size, lastModified: 0};
}

beforeEach(() => {
    createdObjectUrlCount = 0;
    revokedObjectUrls = [];

    vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => `blob:object-url-${++createdObjectUrlCount}`),
        revokeObjectURL: vi.fn((objectUrl) => revokedObjectUrls.push(objectUrl)),
    });

    attachmentService.stageAttachment.mockImplementation(async () => ({id: `attachment-${createdObjectUrlCount}`}));
    attachmentService.deleteAttachment.mockResolvedValue(null);
    restoreValidatedAttachmentDraft.mockResolvedValue([]);
    downscaleImage.mockImplementation(async (candidateFile) => candidateFile);
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('addFiles', () => {
    it('stages an accepted image and marks it ready', async () => {
        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile()]);
        });

        expect(result.current.trayEntries).toHaveLength(1);
        expect(result.current.trayEntries[0]).toMatchObject({
            fileName: 'screenshot.png',
            contentType: 'image/png',
            status: 'ready',
            attachmentId: 'attachment-1',
            caption: '',
            uploadedCaption: '',
        });
        expect(result.current.stagedAttachmentIds).toEqual(['attachment-1']);
        expect(result.current.trayError).toBeNull();
    });

    it('rejects an unsupported file and reports why', async () => {
        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile({name: 'archive.zip', type: 'application/zip'})]);
        });

        expect(result.current.trayEntries).toHaveLength(0);
        expect(result.current.trayError).toContain('not supported');
        expect(attachmentService.stageAttachment).not.toHaveBeenCalled();
    });

    it('stages an accepted document and marks it ready', async () => {
        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile({name: 'notes.pdf', type: 'application/pdf'})]);
        });

        expect(result.current.trayEntries).toHaveLength(1);
        expect(result.current.trayEntries[0]).toMatchObject({
            fileName: 'notes.pdf',
            contentType: 'application/pdf',
            status: 'ready',
            attachmentId: 'attachment-1',
        });
    });

    it('caps the tray at four images and says how many were dropped', async () => {
        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([
                fakeFile({name: 'one.png'}),
                fakeFile({name: 'two.png'}),
                fakeFile({name: 'three.png'}),
                fakeFile({name: 'four.png'}),
                fakeFile({name: 'five.png'}),
            ]);
        });

        expect(result.current.trayEntries).toHaveLength(4);
        expect(result.current.trayError).toContain('the limit is 4 per message');
    });

    it('refuses outright once the tray is already full', async () => {
        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([
                fakeFile({name: 'one.png'}),
                fakeFile({name: 'two.png'}),
                fakeFile({name: 'three.png'}),
                fakeFile({name: 'four.png'}),
            ]);
        });

        await act(async () => {
            result.current.addFiles([fakeFile({name: 'five.png'})]);
        });

        expect(result.current.trayEntries).toHaveLength(4);
        expect(result.current.trayError).toContain('up to 4 files');
    });

    it('lets one upload fail without blocking the others', async () => {
        attachmentService.stageAttachment
            .mockRejectedValueOnce(Object.assign(new Error('unsupported'), {status: 415}))
            .mockResolvedValueOnce({id: 'attachment-2'});

        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile({name: 'one.png'}), fakeFile({name: 'two.png'})]);
        });

        expect(result.current.trayEntries[0]).toMatchObject({status: 'failed'});
        expect(result.current.trayEntries[0].errorMessage).toContain('not supported');
        expect(result.current.trayEntries[1]).toMatchObject({status: 'ready', attachmentId: 'attachment-2'});
        expect(result.current.stagedAttachmentIds).toEqual(['attachment-2']);
    });

    it('maps a 413 to size-specific copy', async () => {
        attachmentService.stageAttachment.mockRejectedValueOnce(Object.assign(new Error('too large'), {status: 413}));

        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile()]);
        });

        expect(result.current.trayEntries[0].errorMessage).toContain('too large');
    });

    it('carries the over-5MB warning onto the entry', async () => {
        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile({size: 6 * 1024 * 1024})]);
        });

        expect(result.current.trayEntries[0].warning).toContain('5MB');
        expect(result.current.trayEntries[0].status).toBe('ready');
    });
});

describe('stale staged ids', () => {
    it('drops the entry rather than offering a retry on a 409', async () => {
        attachmentService.stageAttachment.mockRejectedValueOnce(Object.assign(new Error('conflict'), {status: 409}));

        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile()]);
        });

        expect(result.current.trayEntries).toHaveLength(0);
        expect(result.current.trayError).toContain('no longer available');
    });

    it('drops the entry on a 404 as well', async () => {
        attachmentService.stageAttachment.mockRejectedValueOnce(Object.assign(new Error('gone'), {status: 404}));

        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile()]);
        });

        expect(result.current.trayEntries).toHaveLength(0);
    });
});

describe('draft restoration', () => {
    it('restores validated draft entries and marks them as non-captionable', async () => {
        restoreValidatedAttachmentDraft.mockResolvedValue([{
            attachmentId: 'attachment-restored',
            fileName: 'restored.png',
            contentType: 'image/png',
            fileSizeBytes: 2048,
            caption: 'the banner',
        }]);

        const {result} = renderHook(() => useAttachmentTray({chatId: 'chat-1'}));

        await waitFor(() => expect(result.current.trayEntries).toHaveLength(1));

        expect(result.current.trayEntries[0]).toMatchObject({
            attachmentId: 'attachment-restored',
            fileName: 'restored.png',
            caption: 'the banner',
            uploadedCaption: 'the banner',
            restoredFromDraft: true,
            status: 'ready',
            file: null,
            localObjectUrl: null,
        });
        expect(result.current.stagedAttachmentIds).toEqual(['attachment-restored']);
    });

    it('reads the draft scoped to the current chat', async () => {
        renderHook(() => useAttachmentTray({chatId: 'chat-7'}));

        await waitFor(() => expect(restoreValidatedAttachmentDraft).toHaveBeenCalledWith('chat-7'));
    });

    it('persists the tray on every change', async () => {
        const {result} = renderHook(() => useAttachmentTray({chatId: 'chat-1'}));

        await act(async () => {
            result.current.addFiles([fakeFile()]);
        });

        expect(saveAttachmentDraft).toHaveBeenCalledWith('chat-1', result.current.trayEntries);
    });

    it('clears the stored draft when the tray is cleared after a successful send', async () => {
        const {result} = renderHook(() => useAttachmentTray({chatId: 'chat-1'}));

        await act(async () => {
            result.current.addFiles([fakeFile()]);
        });

        act(() => {
            result.current.clearTray();
        });

        expect(clearAttachmentDraft).toHaveBeenCalledWith('chat-1');
    });

    it('leaves a non-empty tray alone rather than overwriting it with a draft', async () => {
        let resolveRestore;
        restoreValidatedAttachmentDraft.mockReturnValue(new Promise((resolve) => {
            resolveRestore = resolve;
        }));

        const {result} = renderHook(() => useAttachmentTray({chatId: 'chat-1'}));

        await act(async () => {
            result.current.addFiles([fakeFile({name: 'picked.png'})]);
        });

        await act(async () => {
            resolveRestore([{attachmentId: 'attachment-restored', fileName: 'restored.png'}]);
        });

        expect(result.current.trayEntries).toHaveLength(1);
        expect(result.current.trayEntries[0].fileName).toBe('picked.png');
    });
});

describe('downscaling', () => {
    it('uploads the downscaled file and updates the entry size', async () => {
        const downscaledFile = {name: 'big.png', type: 'image/png', size: 2048};
        downscaleImage.mockResolvedValueOnce(downscaledFile);

        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile({name: 'big.png', size: 6 * 1024 * 1024})]);
        });

        expect(attachmentService.stageAttachment).toHaveBeenCalledWith(downscaledFile, '');
        expect(result.current.trayEntries[0]).toMatchObject({
            file: downscaledFile,
            fileSizeBytes: 2048,
            warning: null,
        });
    });

    it('keeps the 5MB warning when downscaling returned the original file', async () => {
        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile({size: 6 * 1024 * 1024})]);
        });

        expect(result.current.trayEntries[0].warning).toContain('5MB');
    });
});

describe('removeEntry', () => {
    it('deletes the staged attachment and revokes its object URL', async () => {
        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile()]);
        });

        const {trayKey, localObjectUrl} = result.current.trayEntries[0];

        await act(async () => {
            result.current.removeEntry(trayKey);
        });

        expect(result.current.trayEntries).toHaveLength(0);
        expect(attachmentService.deleteAttachment).toHaveBeenCalledWith('attachment-1');
        expect(revokedObjectUrls).toContain(localObjectUrl);
    });

    it('revokes without deleting when the upload never produced an id', async () => {
        attachmentService.stageAttachment.mockRejectedValueOnce(new Error('offline'));

        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile()]);
        });

        await act(async () => {
            result.current.removeEntry(result.current.trayEntries[0].trayKey);
        });

        expect(attachmentService.deleteAttachment).not.toHaveBeenCalled();
        expect(revokedObjectUrls).toHaveLength(1);
    });
});

describe('retryEntry', () => {
    it('re-uploads the retained File', async () => {
        attachmentService.stageAttachment.mockRejectedValueOnce(new Error('offline'));

        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile()]);
        });

        expect(result.current.trayEntries[0].status).toBe('failed');

        attachmentService.stageAttachment.mockResolvedValueOnce({id: 'attachment-retry'});

        await act(async () => {
            result.current.retryEntry(result.current.trayEntries[0].trayKey);
        });

        expect(result.current.trayEntries[0]).toMatchObject({status: 'ready', attachmentId: 'attachment-retry'});
    });
});

describe('clearTray', () => {
    it('primes the cache with the local URL and does not revoke it', async () => {
        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile()]);
        });

        const {localObjectUrl} = result.current.trayEntries[0];

        act(() => {
            result.current.clearTray();
        });

        expect(result.current.trayEntries).toHaveLength(0);
        expect(primeAttachmentObjectUrl).toHaveBeenCalledWith('attachment-1', localObjectUrl);
        expect(revokedObjectUrls).not.toContain(localObjectUrl);
        expect(attachmentService.deleteAttachment).not.toHaveBeenCalled();
    });

    it('revokes an entry that never got an id, since nothing else will reference it', async () => {
        attachmentService.stageAttachment.mockRejectedValueOnce(new Error('offline'));

        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile()]);
        });

        const {localObjectUrl} = result.current.trayEntries[0];

        act(() => {
            result.current.clearTray();
        });

        expect(primeAttachmentObjectUrl).not.toHaveBeenCalled();
        expect(revokedObjectUrls).toContain(localObjectUrl);
    });
});

describe('restoreTray', () => {
    it('puts a failed send tray back', () => {
        const {result} = renderHook(() => useAttachmentTray());
        const savedEntries = [{trayKey: 'k1', fileName: 'one.png', status: 'ready', attachmentId: 'attachment-1'}];

        act(() => {
            result.current.restoreTray(savedEntries);
        });

        expect(result.current.trayEntries).toEqual(savedEntries);
        expect(result.current.stagedAttachmentIds).toEqual(['attachment-1']);
    });

    it('ignores an empty restore', () => {
        const {result} = renderHook(() => useAttachmentTray());

        act(() => {
            result.current.restoreTray([]);
        });

        expect(result.current.trayEntries).toHaveLength(0);
    });
});

describe('commitCaptions', () => {
    it('leaves an uncaptioned entry untouched', async () => {
        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile()]);
        });

        attachmentService.stageAttachment.mockClear();

        let settledEntries;
        await act(async () => {
            settledEntries = await result.current.commitCaptions();
        });

        expect(attachmentService.stageAttachment).not.toHaveBeenCalled();
        expect(settledEntries[0]).toMatchObject({attachmentId: 'attachment-1', captionCommitFailed: false});
    });

    it('posts the replacement before deleting the original', async () => {
        const callOrder = [];

        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile()]);
        });

        act(() => {
            result.current.setEntryCaption(result.current.trayEntries[0].trayKey, 'the error banner');
        });

        attachmentService.stageAttachment.mockImplementation(async () => {
            callOrder.push('post');
            return {id: 'attachment-captioned'};
        });
        attachmentService.deleteAttachment.mockImplementation(async () => {
            callOrder.push('delete');
            return null;
        });

        let settledEntries;
        await act(async () => {
            settledEntries = await result.current.commitCaptions();
        });

        expect(callOrder).toEqual(['post', 'delete']);
        expect(attachmentService.stageAttachment).toHaveBeenCalledWith(expect.anything(), 'the error banner');
        expect(attachmentService.deleteAttachment).toHaveBeenCalledWith('attachment-1');
        expect(settledEntries[0]).toMatchObject({
            attachmentId: 'attachment-captioned',
            uploadedCaption: 'the error banner',
            captionCommitFailed: false,
        });
    });

    it('keeps the original id and flags the failure when the re-stage fails, without rejecting', async () => {
        const {result} = renderHook(() => useAttachmentTray());

        await act(async () => {
            result.current.addFiles([fakeFile()]);
        });

        act(() => {
            result.current.setEntryCaption(result.current.trayEntries[0].trayKey, 'the error banner');
        });

        attachmentService.stageAttachment.mockRejectedValueOnce(new Error('upload failed'));

        let settledEntries;
        await act(async () => {
            settledEntries = await result.current.commitCaptions();
        });

        expect(settledEntries[0]).toMatchObject({
            attachmentId: 'attachment-1',
            captionCommitFailed: true,
        });
        expect(attachmentService.deleteAttachment).not.toHaveBeenCalled();
    });
});
