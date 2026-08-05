import attachmentService from '../service/AttachmentService.js';
import {createObjectUrlCache} from './createObjectUrlCache.js';

/**
 * The one piece of shared mutable state in the attachment feature. Blob URLs bypass the
 * HTTP cache entirely, so the server's ETag and Cache-Control do nothing for us — this
 * module is the only cache there is. Keeping it isolated means swapping to signed URLs
 * later touches exactly this file.
 */
const attachmentObjectUrlCache = createObjectUrlCache(
    (attachmentId) => attachmentService.fetchAttachmentBlob(attachmentId)
);

/**
 * Hands a locally-created object URL to the cache under its server id. This is what
 * makes the tray → history handoff free: the optimistic bubble and the reloaded bubble
 * render the identical objectUrl with zero fetches.
 */
export function primeAttachmentObjectUrl(attachmentId, objectUrl) {
    attachmentObjectUrlCache.prime(attachmentId, objectUrl);
}

export async function acquireAttachmentObjectUrl(attachmentId) {
    return await attachmentObjectUrlCache.acquire(attachmentId);
}

export function releaseAttachmentObjectUrl(attachmentId) {
    attachmentObjectUrlCache.release(attachmentId);
}

export function clearAttachmentObjectUrlCache() {
    attachmentObjectUrlCache.clear();
}
