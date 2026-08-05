/**
 * Builds a reference-counted blob-URL cache over an authenticated fetch.
 *
 * Blob URLs bypass the HTTP cache entirely, so the server's ETag and Cache-Control do
 * nothing for us — a cache like this is the only one there is. Extracted as a factory
 * because attachments and generated images have the identical problem: an id that only
 * resolves to bytes through a bearer-token request, rendered by an <img> that cannot
 * carry one.
 *
 * resourceId → { objectUrl, referenceCount, pendingFetch }
 */
export function createObjectUrlCache(fetchBlobById, {softEntryCap = 48} = {}) {
    const objectUrlCache = new Map();

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
        if (objectUrlCache.size <= softEntryCap) {
            return;
        }

        for (const [resourceId, cacheEntry] of objectUrlCache) {
            if (objectUrlCache.size <= softEntryCap) {
                return;
            }

            if (cacheEntry.referenceCount === 0 && !cacheEntry.pendingFetch) {
                revokeObjectUrl(cacheEntry.objectUrl);
                objectUrlCache.delete(resourceId);
            }
        }
    }

    /**
     * Hands a locally-created object URL to the cache under its server id, so bytes the
     * browser already holds are never fetched back.
     */
    function prime(resourceId, objectUrl) {
        if (!resourceId || !objectUrl) {
            return;
        }

        const existingEntry = objectUrlCache.get(resourceId);

        if (existingEntry) {
            if (existingEntry.objectUrl !== objectUrl) {
                revokeObjectUrl(objectUrl);
            }

            return;
        }

        objectUrlCache.set(resourceId, {objectUrl, referenceCount: 0, pendingFetch: null});
        evictUnreferencedEntriesPastCap();
    }

    async function acquire(resourceId) {
        if (!resourceId) {
            return null;
        }

        const existingEntry = objectUrlCache.get(resourceId);

        if (existingEntry) {
            existingEntry.referenceCount += 1;

            if (existingEntry.objectUrl) {
                return existingEntry.objectUrl;
            }

            return await existingEntry.pendingFetch;
        }

        const cacheEntry = {objectUrl: null, referenceCount: 1, pendingFetch: null};

        cacheEntry.pendingFetch = fetchBlobById(resourceId)
            .then((responseBlob) => {
                const objectUrl = URL.createObjectURL(responseBlob);
                cacheEntry.objectUrl = objectUrl;
                cacheEntry.pendingFetch = null;

                return objectUrl;
            })
            .catch((caughtError) => {
                objectUrlCache.delete(resourceId);
                throw caughtError;
            });

        objectUrlCache.set(resourceId, cacheEntry);
        evictUnreferencedEntriesPastCap();

        return await cacheEntry.pendingFetch;
    }

    function release(resourceId) {
        const cacheEntry = objectUrlCache.get(resourceId);

        if (!cacheEntry) {
            return;
        }

        cacheEntry.referenceCount = Math.max(0, cacheEntry.referenceCount - 1);

        evictUnreferencedEntriesPastCap();
    }

    function clear() {
        for (const cacheEntry of objectUrlCache.values()) {
            revokeObjectUrl(cacheEntry.objectUrl);
        }

        objectUrlCache.clear();
    }

    return {prime, acquire, release, clear};
}
