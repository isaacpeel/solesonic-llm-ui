export const ACCEPTED_IMAGE_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const ACCEPTED_IMAGE_ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_CONTENT_TYPES.join(',');
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_VISION_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

const EXTENSION_CONTENT_TYPES = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
};

/**
 * Some drag sources and clipboard payloads hand over a File with an empty `type`.
 * Uploading that unchanged earns a 415, so infer the content type from the file name.
 */
export function inferContentTypeFromFileName(fileName) {
    if (typeof fileName !== 'string') {
        return null;
    }

    const lastDotIndex = fileName.lastIndexOf('.');

    if (lastDotIndex < 0) {
        return null;
    }

    const extension = fileName.slice(lastDotIndex + 1).toLowerCase();

    return EXTENSION_CONTENT_TYPES[extension] || null;
}

/**
 * Returns the candidate file when its content type is already usable, otherwise a
 * rebuilt File carrying the inferred type. Returns the original file when nothing
 * can be inferred, so validation reports the rejection rather than this function.
 */
export function withInferredContentType(candidateFile) {
    if (!candidateFile) {
        return candidateFile;
    }

    if (candidateFile.type && ACCEPTED_IMAGE_CONTENT_TYPES.includes(candidateFile.type)) {
        return candidateFile;
    }

    const inferredContentType = inferContentTypeFromFileName(candidateFile.name);

    if (!inferredContentType) {
        return candidateFile;
    }

    return new File([candidateFile], candidateFile.name, {
        type: inferredContentType,
        lastModified: candidateFile.lastModified,
    });
}

export function formatByteSize(byteCount) {
    if (typeof byteCount !== 'number' || Number.isNaN(byteCount)) {
        return '';
    }

    if (byteCount < 1024) {
        return `${byteCount} B`;
    }

    if (byteCount < 1024 * 1024) {
        return `${Math.round(byteCount / 1024)} KB`;
    }

    return `${(byteCount / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * → { valid: true, warning: string | null } | { valid: false, reason: string }
 */
export function validateImageFile(candidateFile) {
    if (!candidateFile) {
        return {valid: false, reason: 'No file was provided'};
    }

    if (!candidateFile.type || !ACCEPTED_IMAGE_CONTENT_TYPES.includes(candidateFile.type)) {
        return {valid: false, reason: 'Only PNG, JPEG, GIF and WebP images can be attached'};
    }

    if (candidateFile.size > MAX_UPLOAD_BYTES) {
        return {valid: false, reason: 'Images must be under 20MB'};
    }

    if (candidateFile.size > MAX_VISION_BYTES) {
        return {
            valid: true,
            warning: 'Larger than 5MB — the assistant may not be able to read this image',
        };
    }

    return {valid: true, warning: null};
}
