import imageGenerationService from '../service/ImageGenerationService.js';
import {createObjectUrlCache} from './createObjectUrlCache.js';

/**
 * Generated images are served from an authorization-checked API endpoint, so an <img src>
 * pointing straight at `imageUrl` would 401 — the bytes have to come through a bearer-token
 * request and be handed to the DOM as a blob URL, exactly as attachments do.
 *
 * The ids are content-addressed and immutable, so an entry is good for the life of the tab.
 */
const generatedImageObjectUrlCache = createObjectUrlCache(
    (imageId) => imageGenerationService.fetchGeneratedImageBlob(imageId)
);

export async function acquireGeneratedImageObjectUrl(imageId) {
    return await generatedImageObjectUrlCache.acquire(imageId);
}

export function releaseGeneratedImageObjectUrl(imageId) {
    generatedImageObjectUrlCache.release(imageId);
}

export function clearGeneratedImageObjectUrlCache() {
    generatedImageObjectUrlCache.clear();
}
