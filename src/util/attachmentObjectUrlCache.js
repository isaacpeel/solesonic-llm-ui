import attachmentService from '../service/AttachmentService.js';

/**
 * The one piece of shared mutable state in the attachment feature. Blob URLs bypass the
 * HTTP cache entirely, so the server's ETag and Cache-Control do nothing for us — this
 * module is the only cache there is. Keeping it isolated means swapping to signed URLs
 * later touches exactly this file.
 *
 * attachmentId → { objectUrl, referenceCount, pendingFetch }
 */
const objectUrlCache = new Map();

const SOFT_ENTRY_CAP = 48;

function revokeObjectUrl(objectUrl) {
    if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
    }
}

/**
 * Evicts unreferenced entries once the cache grows past its soft cap. Entries with a
 * live reference are never revoked — revoking a URL still bound to a mounted <img>
 * produces a broken image with no error event.
 */
function evictUnreferencedEntriesPastCap() {
    if (objectUrlCache.size <= SOFT_ENTRY_CAP) {
        return;
    }

    for (const [attachmentId, cacheEntry] of objectUrlCache) {
        if (objectUrlCache.size <= SOFT_ENTRY_CAP) {
            return;
        }

        if (cacheEntry.referenceCount === 0 && !cacheEntry.pendingFetch) {
            revokeObjectUrl(cacheEntry.objectUrl);
            objectUrlCache.delete(attachmentId);
        }
    }
}

/**
 * Hands a locally-created object URL to the cache under its server id. This is what
 * makes the tray → history handoff free: the optimistic bubble and the reloaded bubble
 * render the identical objectUrl with zero fetches.
 */
export function primeAttachmentObjectUrl(attachmentId, objectUrl) {
    if (!attachmentId || !objectUrl) {
        return;
    }

    const existingEntry = objectUrlCache.get(attachmentId);

    if (existingEntry) {
        if (existingEntry.objectUrl !== objectUrl) {
            revokeObjectUrl(objectUrl);
        }

        return;
    }

    objectUrlCache.set(attachmentId, {objectUrl, referenceCount: 0, pendingFetch: null});
    evictUnreferencedEntriesPastCap();
}

export async function acquireAttachmentObjectUrl(attachmentId) {
    if (!attachmentId) {
        return null;
    }

    const existingEntry = objectUrlCache.get(attachmentId);

    if (existingEntry) {
        existingEntry.referenceCount += 1;

        if (existingEntry.objectUrl) {
            return existingEntry.objectUrl;
        }

        return await existingEntry.pendingFetch;
    }

    const cacheEntry = {objectUrl: null, referenceCount: 1, pendingFetch: null};

    cacheEntry.pendingFetch = attachmentService.fetchAttachmentBlob(attachmentId)
        .then((responseBlob) => {
            const objectUrl = URL.createObjectURL(responseBlob);
            cacheEntry.objectUrl = objectUrl;
            cacheEntry.pendingFetch = null;

            return objectUrl;
        })
        .catch((caughtError) => {
            objectUrlCache.delete(attachmentId);
            throw caughtError;
        });

    objectUrlCache.set(attachmentId, cacheEntry);
    evictUnreferencedEntriesPastCap();

    return await cacheEntry.pendingFetch;
}

export function releaseAttachmentObjectUrl(attachmentId) {
    const cacheEntry = objectUrlCache.get(attachmentId);

    if (!cacheEntry) {
        return;
    }

    cacheEntry.referenceCount = Math.max(0, cacheEntry.referenceCount - 1);

    evictUnreferencedEntriesPastCap();
}

export function clearAttachmentObjectUrlCache() {
    for (const cacheEntry of objectUrlCache.values()) {
        revokeObjectUrl(cacheEntry.objectUrl);
    }

    objectUrlCache.clear();
}
