import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('../../src/service/AttachmentService.js', () => ({
    default: {
        fetchAttachmentBlob: vi.fn(),
    },
}));

import {
    acquireAttachmentObjectUrl,
    clearAttachmentObjectUrlCache,
    primeAttachmentObjectUrl,
    releaseAttachmentObjectUrl,
} from '../../src/util/attachmentObjectUrlCache.js';
import attachmentService from '../../src/service/AttachmentService.js';

let createdObjectUrlCount;
let revokedObjectUrls;

beforeEach(() => {
    createdObjectUrlCount = 0;
    revokedObjectUrls = [];

    vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => `blob:fetched-${++createdObjectUrlCount}`),
        revokeObjectURL: vi.fn((objectUrl) => revokedObjectUrls.push(objectUrl)),
    });

    attachmentService.fetchAttachmentBlob.mockResolvedValue({size: 10});
});

afterEach(() => {
    clearAttachmentObjectUrlCache();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('primeAttachmentObjectUrl', () => {
    it('serves a primed URL without fetching', async () => {
        primeAttachmentObjectUrl('attachment-1', 'blob:local-1');

        const objectUrl = await acquireAttachmentObjectUrl('attachment-1');

        expect(objectUrl).toBe('blob:local-1');
        expect(attachmentService.fetchAttachmentBlob).not.toHaveBeenCalled();
    });

    it('ignores a second prime for the same id and revokes the redundant URL', async () => {
        primeAttachmentObjectUrl('attachment-1', 'blob:local-1');
        primeAttachmentObjectUrl('attachment-1', 'blob:local-2');

        const objectUrl = await acquireAttachmentObjectUrl('attachment-1');

        expect(objectUrl).toBe('blob:local-1');
        expect(revokedObjectUrls).toContain('blob:local-2');
    });

    it('ignores a prime with a missing id or URL', async () => {
        primeAttachmentObjectUrl(null, 'blob:local-1');
        primeAttachmentObjectUrl('attachment-1', null);

        await acquireAttachmentObjectUrl('attachment-1');

        expect(attachmentService.fetchAttachmentBlob).toHaveBeenCalledTimes(1);
    });
});

describe('acquireAttachmentObjectUrl', () => {
    it('fetches once for concurrent acquires of the same id', async () => {
        const [firstObjectUrl, secondObjectUrl] = await Promise.all([
            acquireAttachmentObjectUrl('attachment-1'),
            acquireAttachmentObjectUrl('attachment-1'),
        ]);

        expect(attachmentService.fetchAttachmentBlob).toHaveBeenCalledTimes(1);
        expect(firstObjectUrl).toBe('blob:fetched-1');
        expect(secondObjectUrl).toBe('blob:fetched-1');
    });

    it('reuses the cached URL on a later acquire', async () => {
        await acquireAttachmentObjectUrl('attachment-1');
        const secondObjectUrl = await acquireAttachmentObjectUrl('attachment-1');

        expect(attachmentService.fetchAttachmentBlob).toHaveBeenCalledTimes(1);
        expect(secondObjectUrl).toBe('blob:fetched-1');
    });

    it('returns null for a missing id', async () => {
        await expect(acquireAttachmentObjectUrl(null)).resolves.toBeNull();
    });

    it('propagates a fetch failure and does not cache it', async () => {
        attachmentService.fetchAttachmentBlob.mockRejectedValueOnce(Object.assign(new Error('gone'), {status: 404}));

        await expect(acquireAttachmentObjectUrl('attachment-1')).rejects.toThrow('gone');

        attachmentService.fetchAttachmentBlob.mockResolvedValueOnce({size: 10});
        await expect(acquireAttachmentObjectUrl('attachment-1')).resolves.toBe('blob:fetched-1');
    });
});

describe('eviction', () => {
    it('does not revoke a URL that still has a live reference', async () => {
        await acquireAttachmentObjectUrl('attachment-held');

        for (let entryIndex = 0; entryIndex < 60; entryIndex += 1) {
            const attachmentId = `attachment-filler-${entryIndex}`;
            await acquireAttachmentObjectUrl(attachmentId);
            releaseAttachmentObjectUrl(attachmentId);
        }

        expect(revokedObjectUrls).not.toContain('blob:fetched-1');
        await expect(acquireAttachmentObjectUrl('attachment-held')).resolves.toBe('blob:fetched-1');
    });

    it('revokes unreferenced entries once the cache grows past its cap', async () => {
        for (let entryIndex = 0; entryIndex < 60; entryIndex += 1) {
            const attachmentId = `attachment-${entryIndex}`;
            await acquireAttachmentObjectUrl(attachmentId);
            releaseAttachmentObjectUrl(attachmentId);
        }

        expect(revokedObjectUrls.length).toBeGreaterThan(0);
    });

    it('release never drives the reference count below zero', async () => {
        primeAttachmentObjectUrl('attachment-1', 'blob:local-1');

        releaseAttachmentObjectUrl('attachment-1');
        releaseAttachmentObjectUrl('attachment-1');

        await expect(acquireAttachmentObjectUrl('attachment-1')).resolves.toBe('blob:local-1');
    });

    it('release of an unknown id is a no-op', () => {
        expect(() => releaseAttachmentObjectUrl('nope')).not.toThrow();
    });
});
