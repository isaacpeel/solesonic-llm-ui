import log from 'loglevel';
import attachmentService from '../service/AttachmentService.js';

const DRAFT_STORAGE_KEY_PREFIX = 'solesonic.attachmentDraft';

function draftStorageKey(chatId) {
    return `${DRAFT_STORAGE_KEY_PREFIX}.${chatId || 'new'}`;
}

/**
 * Persists the staged ids of the current tray. Bytes are deliberately not persisted, so a
 * restored entry has no `localObjectUrl` and no retained `File` — which is why caption
 * editing is disabled on restored entries.
 */
export function saveAttachmentDraft(chatId, trayEntries) {
    if (typeof sessionStorage === 'undefined') {
        return;
    }

    const persistableEntries = (trayEntries || [])
        .filter((entry) => entry.status === 'ready' && entry.attachmentId)
        .map((entry) => ({
            attachmentId: entry.attachmentId,
            fileName: entry.fileName,
            contentType: entry.contentType,
            fileSizeBytes: entry.fileSizeBytes,
            caption: entry.caption || '',
        }));

    try {
        if (persistableEntries.length === 0) {
            sessionStorage.removeItem(draftStorageKey(chatId));
            return;
        }

        sessionStorage.setItem(draftStorageKey(chatId), JSON.stringify(persistableEntries));
    } catch (caughtError) {
        log.error('[attachmentDraftStorage] Failed to persist the attachment draft:', caughtError);
    }
}

export function readAttachmentDraft(chatId) {
    if (typeof sessionStorage === 'undefined') {
        return [];
    }

    try {
        const storedValue = sessionStorage.getItem(draftStorageKey(chatId));

        if (!storedValue) {
            return [];
        }

        const parsedEntries = JSON.parse(storedValue);

        return Array.isArray(parsedEntries) ? parsedEntries : [];
    } catch (caughtError) {
        log.error('[attachmentDraftStorage] Failed to read the attachment draft:', caughtError);

        return [];
    }
}

export function clearAttachmentDraft(chatId) {
    if (typeof sessionStorage === 'undefined') {
        return;
    }

    try {
        sessionStorage.removeItem(draftStorageKey(chatId));
    } catch (caughtError) {
        log.error('[attachmentDraftStorage] Failed to clear the attachment draft:', caughtError);
    }
}

/**
 * Revalidates every restored id against the server, dropping any that no longer exist.
 * An unvalidated restored id is exactly the silent-stream-death case: the send would be
 * accepted and then the stream would simply stop.
 */
export async function restoreValidatedAttachmentDraft(chatId) {
    const storedEntries = readAttachmentDraft(chatId);

    if (storedEntries.length === 0) {
        return [];
    }

    const validationResults = await Promise.all(storedEntries.map(async (storedEntry) => {
        try {
            const stillExists = await attachmentService.attachmentExists(storedEntry.attachmentId);

            return stillExists ? storedEntry : null;
        } catch (caughtError) {
            log.error('[attachmentDraftStorage] Failed to revalidate a restored attachment:', caughtError);

            return null;
        }
    }));

    return validationResults.filter((storedEntry) => storedEntry !== null);
}
