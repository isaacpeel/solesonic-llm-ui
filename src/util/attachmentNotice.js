import {isImageAttachment} from './imageValidation.js';

const WARNING = 'warning';
const INFO = 'info';

const NOT_NEEDED = 'NOT_NEEDED';
const NOT_NEEDED_TEXT = 'Sent to the image tool as is. The assistant did not need to read it.';
const GENERIC_IMAGE_TEXT = 'The assistant may not have been able to read this image.';
const GENERIC_DOCUMENT_TEXT = 'This document could not be indexed for retrieval.';

export const VISION_REASON_TEXT = {
    VISION_TIMEOUT: 'The image reader took too long. Try again in a moment.',
    VISION_UNAVAILABLE: 'The image reader is unavailable, so the assistant could not see this image.',
    IMAGE_TOO_LARGE: 'This image is too large for the assistant to read.',
    IMAGE_UNREADABLE: 'The assistant could not read this image.',
    EXCEEDED_IMAGE_LIMIT: 'Too many images in one message. The assistant only read the first few.',
};

export const EXTRACTION_REASON_TEXT = {
    DOCUMENT_TOO_LARGE: 'This document is too large to index.',
    DOCUMENT_UNREADABLE: 'This document could not be read. It may be encrypted, corrupt, or scanned.',
    EMBEDDING_UNAVAILABLE: 'Indexing is unavailable right now, so the assistant cannot search this document.',
    EXCEEDED_DOCUMENT_LIMIT: 'Too many documents in one message. Only the first few were indexed.',
};

function reasonText(reasonTextByConstant, reason, fallbackText) {
    return Object.hasOwn(reasonTextByConstant, reason) ? reasonTextByConstant[reason] : fallbackText;
}

function imageNotice(attachment) {
    if (attachment.described !== false) {
        return undefined;
    }

    const reason = attachment.reason ?? attachment.descriptionFailureReason;

    if (!reason) {
        return undefined;
    }

    if (reason === NOT_NEEDED) {
        return {tone: INFO, text: NOT_NEEDED_TEXT};
    }

    return {tone: WARNING, text: reasonText(VISION_REASON_TEXT, reason, GENERIC_IMAGE_TEXT)};
}

function documentNotice(attachment) {
    if (attachment.indexed !== false) {
        return undefined;
    }

    const reason = attachment.extractionReason ?? attachment.extractionFailureReason;

    if (!reason) {
        return undefined;
    }

    return {tone: WARNING, text: reasonText(EXTRACTION_REASON_TEXT, reason, GENERIC_DOCUMENT_TEXT)};
}

/*
 * `described`/`indexed` are only `false` once the turn has finished that pass, so `undefined`
 * (still in flight, or a row from before the field existed) is never a notice. `false` with no
 * reason means the pass was never attempted — the API saves a reason for every real failure —
 * so that is not a notice either.
 */
export function attachmentNotice(attachment) {
    if (!attachment) {
        return undefined;
    }

    const isImage = isImageAttachment({contentType: attachment.contentType, fileName: attachment.fileName});

    return isImage ? imageNotice(attachment) : documentNotice(attachment);
}
