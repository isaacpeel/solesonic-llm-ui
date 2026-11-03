import {describe, it, expect} from 'vitest';
import {
    attachmentNotice,
    EXTRACTION_REASON_TEXT,
    VISION_REASON_TEXT,
} from '../../src/util/attachmentNotice.js';

const IMAGE = {fileName: 'one.png', contentType: 'image/png'};
const DOCUMENT = {fileName: 'notes.pdf', contentType: 'application/pdf'};
const GENERIC_IMAGE_TEXT = 'The assistant may not have been able to read this image.';
const GENERIC_DOCUMENT_TEXT = 'This document could not be indexed for retrieval.';

describe('attachmentNotice', () => {
    it.each([
        ['VISION_TIMEOUT', 'The image reader took too long. Try again in a moment.'],
        ['VISION_UNAVAILABLE', 'The image reader is unavailable, so the assistant could not see this image.'],
        ['IMAGE_TOO_LARGE', 'This image is too large for the assistant to read.'],
        ['IMAGE_UNREADABLE', 'The assistant could not read this image.'],
        ['EXCEEDED_IMAGE_LIMIT', 'Too many images in one message. The assistant only read the first few.'],
    ])('maps the vision reason %s to a warning', (reason, text) => {
        expect(attachmentNotice({...IMAGE, described: false, reason})).toEqual({tone: 'warning', text});
        expect(VISION_REASON_TEXT[reason]).toBe(text);
    });

    it.each([
        ['DOCUMENT_TOO_LARGE', 'This document is too large to index.'],
        ['DOCUMENT_UNREADABLE', 'This document could not be read. It may be encrypted, corrupt, or scanned.'],
        ['EMBEDDING_UNAVAILABLE', 'Indexing is unavailable right now, so the assistant cannot search this document.'],
        ['EXCEEDED_DOCUMENT_LIMIT', 'Too many documents in one message. Only the first few were indexed.'],
    ])('maps the extraction reason %s to a warning', (reason, text) => {
        expect(attachmentNotice({...DOCUMENT, indexed: false, extractionReason: reason})).toEqual({tone: 'warning', text});
        expect(EXTRACTION_REASON_TEXT[reason]).toBe(text);
    });

    it('treats NOT_NEEDED as information, never showing the raw constant', () => {
        const notice = attachmentNotice({...IMAGE, described: false, reason: 'NOT_NEEDED'});

        expect(notice.tone).toBe('info');
        expect(notice.text).toBe('Sent to the image tool as is. The assistant did not need to read it.');
        expect(notice.text).not.toContain('NOT_NEEDED');
    });

    it('falls back to the generic image warning for an unknown vision reason', () => {
        const notice = attachmentNotice({...IMAGE, described: false, reason: 'SOME_NEW_REASON'});

        expect(notice).toEqual({tone: 'warning', text: GENERIC_IMAGE_TEXT});
        expect(notice.text).not.toContain('SOME_NEW_REASON');
    });

    it('never reads an inherited property as reason text', () => {
        expect(attachmentNotice({...IMAGE, described: false, reason: 'constructor'}))
            .toEqual({tone: 'warning', text: GENERIC_IMAGE_TEXT});
    });

    it('falls back to the generic document warning for an unknown extraction reason', () => {
        const notice = attachmentNotice({...DOCUMENT, indexed: false, extractionReason: 'SOME_NEW_REASON'});

        expect(notice).toEqual({tone: 'warning', text: GENERIC_DOCUMENT_TEXT});
    });

    it('reads the history field names the same as the live names', () => {
        expect(attachmentNotice({...IMAGE, described: false, descriptionFailureReason: 'VISION_TIMEOUT'}))
            .toEqual(attachmentNotice({...IMAGE, described: false, reason: 'VISION_TIMEOUT'}));
        expect(attachmentNotice({...IMAGE, described: false, descriptionFailureReason: 'NOT_NEEDED'}))
            .toEqual(attachmentNotice({...IMAGE, described: false, reason: 'NOT_NEEDED'}));
        expect(attachmentNotice({...DOCUMENT, indexed: false, extractionFailureReason: 'DOCUMENT_TOO_LARGE'}))
            .toEqual(attachmentNotice({...DOCUMENT, indexed: false, extractionReason: 'DOCUMENT_TOO_LARGE'}));
    });

    it('shows nothing for a reloaded image that was never described', () => {
        expect(attachmentNotice({...IMAGE, described: false, descriptionFailureReason: null})).toBeUndefined();
    });

    it('shows nothing for a reloaded document that indexed fine', () => {
        expect(attachmentNotice({
            ...DOCUMENT,
            described: false,
            descriptionFailureReason: null,
            indexed: true,
            extractionFailureReason: null,
        })).toBeUndefined();
    });

    it('shows nothing for a document with indexed false and no reason', () => {
        expect(attachmentNotice({...DOCUMENT, indexed: false, extractionFailureReason: null})).toBeUndefined();
    });

    it('applies only document rules to a document, even with a vision reason', () => {
        expect(attachmentNotice({...DOCUMENT, described: false, reason: 'VISION_TIMEOUT'})).toBeUndefined();
    });

    it('applies only image rules to an image, even with an extraction reason', () => {
        expect(attachmentNotice({...IMAGE, indexed: false, extractionReason: 'DOCUMENT_TOO_LARGE'})).toBeUndefined();
    });

    it('shows nothing once described or indexed is confirmed true', () => {
        expect(attachmentNotice({...IMAGE, described: true})).toBeUndefined();
        expect(attachmentNotice({...DOCUMENT, indexed: true})).toBeUndefined();
    });

    it('shows nothing while described or indexed is still undefined', () => {
        expect(attachmentNotice({...IMAGE})).toBeUndefined();
        expect(attachmentNotice({...DOCUMENT})).toBeUndefined();
    });

    it('infers an image from its file name when no content type is given', () => {
        expect(attachmentNotice({fileName: 'one.png', described: false, reason: 'IMAGE_TOO_LARGE'}))
            .toEqual({tone: 'warning', text: VISION_REASON_TEXT.IMAGE_TOO_LARGE});
    });
});
