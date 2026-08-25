import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import log from 'loglevel';
import attachmentService from '../service/AttachmentService.js';
import {generateMessageKey} from '../util/keys.js';
import {primeAttachmentObjectUrl} from '../util/attachmentObjectUrlCache.js';
import {downscaleImage} from '../util/downscaleImage.js';
import {
    clearAttachmentDraft,
    restoreValidatedAttachmentDraft,
    saveAttachmentDraft,
} from '../util/attachmentDraftStorage.js';
import {
    MAX_ATTACHMENTS_PER_MESSAGE,
    validateAttachmentFile,
    withInferredContentType,
} from '../util/imageValidation.js';

export const UPLOADING = 'uploading';
export const READY = 'ready';
export const FAILED = 'failed';

/*
 * A 409 or 404 against a staged id means the tray is stale — the id is gone server-side and
 * retrying the same one cannot succeed. Those entries are dropped rather than left retryable.
 */
const STALE_ATTACHMENT_STATUSES = [404, 409];

function messageForUploadFailure(caughtError) {
    switch (caughtError?.status) {
        case 415:
            return 'That file type is not supported';
        case 413:
            return 'That file is too large to upload';
        case 409:
        case 404:
            return 'This file is no longer available, please re-attach it';
        case 401:
            return 'Your session expired while uploading';
        default:
            return 'Upload failed — tap to retry';
    }
}

function useAttachmentTray({chatId} = {}) {
    const [trayEntries, setTrayEntries] = useState([]);
    const [trayError, setTrayError] = useState(null);
    const trayEntriesRef = useRef([]);

    trayEntriesRef.current = trayEntries;

    const updateEntry = useCallback((trayKey, changes) => {
        setTrayEntries((previousEntries) => {
            return previousEntries.map((entry) => {
                if (entry.trayKey !== trayKey) {
                    return entry;
                }

                return {...entry, ...changes};
            });
        });
    }, []);

    const uploadEntry = useCallback(async (trayKey, file, description) => {
        try {
            /*
             * Shrink oversized images before upload so the 5MB vision warning is rare rather
             * than routine. Returns the original file when it is already small enough, is an
             * animated GIF, or cannot be re-encoded.
             */
            const fileToUpload = await downscaleImage(file);

            if (fileToUpload !== file) {
                updateEntry(trayKey, {
                    file: fileToUpload,
                    fileSizeBytes: fileToUpload.size,
                    warning: null,
                });
            }

            const stagedAttachment = await attachmentService.stageAttachment(fileToUpload, description);

            updateEntry(trayKey, {
                attachmentId: stagedAttachment?.id ?? null,
                uploadedCaption: (description || '').trim(),
                status: stagedAttachment?.id ? READY : FAILED,
                errorMessage: stagedAttachment?.id ? null : 'Upload failed — tap to retry',
            });
        } catch (caughtError) {
            log.error('[useAttachmentTray] Failed to stage attachment:', caughtError);

            if (STALE_ATTACHMENT_STATUSES.includes(caughtError?.status)) {
                setTrayEntries((previousEntries) => previousEntries.filter((entry) => entry.trayKey !== trayKey));
                setTrayError(messageForUploadFailure(caughtError));

                return;
            }

            updateEntry(trayKey, {
                status: FAILED,
                errorMessage: messageForUploadFailure(caughtError),
            });
        }
    }, [updateEntry]);

    const addFiles = useCallback((candidateFiles) => {
        const fileList = Array.from(candidateFiles || []);

        if (fileList.length === 0) {
            return;
        }

        const availableSlots = MAX_ATTACHMENTS_PER_MESSAGE - trayEntriesRef.current.length;

        if (availableSlots <= 0) {
            setTrayError(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message`);
            return;
        }

        const acceptedEntries = [];
        const rejectionReasons = [];
        let droppedForCapCount = 0;

        for (const candidateFile of fileList) {
            if (acceptedEntries.length >= availableSlots) {
                droppedForCapCount += 1;
                continue;
            }

            const typedFile = withInferredContentType(candidateFile);
            const validationResult = validateAttachmentFile(typedFile);

            if (!validationResult.valid) {
                rejectionReasons.push(`${typedFile?.name || 'That file'}: ${validationResult.reason}`);
                continue;
            }

            acceptedEntries.push({
                trayKey: generateMessageKey('attachment'),
                file: typedFile,
                fileName: typedFile.name,
                contentType: typedFile.type,
                fileSizeBytes: typedFile.size,
                localObjectUrl: URL.createObjectURL(typedFile),
                attachmentId: null,
                caption: '',
                uploadedCaption: '',
                captionCommitFailed: false,
                status: UPLOADING,
                warning: validationResult.warning,
                errorMessage: null,
            });
        }

        const problemMessages = [...rejectionReasons];

        if (droppedForCapCount > 0) {
            problemMessages.push(`${droppedForCapCount} file${droppedForCapCount === 1 ? ' was' : 's were'} not attached — the limit is ${MAX_ATTACHMENTS_PER_MESSAGE} per message`);
        }

        setTrayError(problemMessages.length > 0 ? problemMessages.join('. ') : null);

        if (acceptedEntries.length === 0) {
            return;
        }

        setTrayEntries((previousEntries) => [...previousEntries, ...acceptedEntries]);

        /* Uploads run concurrently so one slow or failing file does not hold up the others. */
        for (const acceptedEntry of acceptedEntries) {
            void uploadEntry(acceptedEntry.trayKey, acceptedEntry.file, '');
        }
    }, [uploadEntry]);

    const removeEntry = useCallback((trayKey) => {
        const entryToRemove = trayEntriesRef.current.find((entry) => entry.trayKey === trayKey);

        setTrayEntries((previousEntries) => previousEntries.filter((entry) => entry.trayKey !== trayKey));
        setTrayError(null);

        if (!entryToRemove) {
            return;
        }

        if (entryToRemove.localObjectUrl) {
            URL.revokeObjectURL(entryToRemove.localObjectUrl);
        }

        if (entryToRemove.attachmentId) {
            attachmentService.deleteAttachment(entryToRemove.attachmentId)
                .catch((caughtError) => {
                    log.error('[useAttachmentTray] Failed to delete staged attachment:', caughtError);
                });
        }
    }, []);

    const retryEntry = useCallback((trayKey) => {
        const entryToRetry = trayEntriesRef.current.find((entry) => entry.trayKey === trayKey);

        if (!entryToRetry || !entryToRetry.file) {
            return;
        }

        updateEntry(trayKey, {status: UPLOADING, errorMessage: null});
        void uploadEntry(trayKey, entryToRetry.file, entryToRetry.caption);
    }, [updateEntry, uploadEntry]);

    const setEntryCaption = useCallback((trayKey, caption) => {
        updateEntry(trayKey, {caption});
    }, [updateEntry]);

    /**
     * The backend takes `description` only on the initial multipart upload, so a caption
     * typed after staging has nowhere to go. Re-stage those entries on send.
     *
     * Order is load-bearing: POST the replacement first, and only DELETE the old id once
     * it resolves. Deleting first and then failing the upload would lose the image itself,
     * turning a lost caption into a lost attachment. Never rejects — a caption is not
     * worth discarding the user's typed message over.
     */
    const commitCaptions = useCallback(async () => {
        const currentEntries = trayEntriesRef.current.filter((entry) => entry.status === READY && entry.attachmentId);

        const settledEntries = await Promise.all(currentEntries.map(async (entry) => {
            const trimmedCaption = (entry.caption || '').trim();

            if (trimmedCaption === (entry.uploadedCaption || '')) {
                return {...entry, captionCommitFailed: false};
            }

            if (!entry.file) {
                return {...entry, captionCommitFailed: true};
            }

            try {
                const restagedAttachment = await attachmentService.stageAttachment(entry.file, trimmedCaption);

                if (!restagedAttachment?.id) {
                    return {...entry, captionCommitFailed: true};
                }

                const previousAttachmentId = entry.attachmentId;

                attachmentService.deleteAttachment(previousAttachmentId)
                    .catch((caughtError) => {
                        log.error('[useAttachmentTray] Failed to delete superseded attachment:', caughtError);
                    });

                return {
                    ...entry,
                    attachmentId: restagedAttachment.id,
                    uploadedCaption: trimmedCaption,
                    captionCommitFailed: false,
                };
            } catch (caughtError) {
                log.error('[useAttachmentTray] Failed to re-stage attachment with a caption:', caughtError);

                return {...entry, captionCommitFailed: true};
            }
        }));

        const settledEntriesByKey = new Map(settledEntries.map((entry) => [entry.trayKey, entry]));

        setTrayEntries((previousEntries) => {
            return previousEntries.map((entry) => settledEntriesByKey.get(entry.trayKey) || entry);
        });

        return settledEntries;
    }, []);

    /**
     * Forgets the tray WITHOUT deleting server-side — once `init` arrives the ids belong
     * to a message. The local object URLs are handed to the cache rather than revoked, so
     * the sent bubble keeps rendering them with no fetch.
     */
    const clearTray = useCallback(() => {
        for (const entry of trayEntriesRef.current) {
            if (entry.attachmentId && entry.localObjectUrl) {
                primeAttachmentObjectUrl(entry.attachmentId, entry.localObjectUrl);
            } else if (entry.localObjectUrl) {
                URL.revokeObjectURL(entry.localObjectUrl);
            }
        }

        setTrayEntries([]);
        setTrayError(null);
        clearAttachmentDraft(chatId);
    }, [chatId]);

    const restoreTray = useCallback((entriesToRestore) => {
        if (!Array.isArray(entriesToRestore) || entriesToRestore.length === 0) {
            return;
        }

        setTrayEntries(entriesToRestore);
    }, []);

    /*
     * Restore any draft staged for this chat, dropping ids the server no longer knows about.
     * Restored entries have no bytes, so they render through useAttachmentUrl like history
     * and cannot be re-staged for a caption edit — hence `restoredFromDraft`.
     */
    useEffect(() => {
        let isEffectActive = true;

        restoreValidatedAttachmentDraft(chatId)
            .then((validatedEntries) => {
                if (!isEffectActive || validatedEntries.length === 0) {
                    return;
                }

                setTrayEntries((previousEntries) => {
                    if (previousEntries.length > 0) {
                        return previousEntries;
                    }

                    return validatedEntries.map((validatedEntry) => ({
                        trayKey: generateMessageKey('attachment'),
                        file: null,
                        fileName: validatedEntry.fileName,
                        contentType: validatedEntry.contentType,
                        fileSizeBytes: validatedEntry.fileSizeBytes,
                        localObjectUrl: null,
                        attachmentId: validatedEntry.attachmentId,
                        caption: validatedEntry.caption || '',
                        uploadedCaption: validatedEntry.caption || '',
                        captionCommitFailed: false,
                        restoredFromDraft: true,
                        status: READY,
                        warning: null,
                        errorMessage: null,
                    }));
                });
            })
            .catch((caughtError) => {
                log.error('[useAttachmentTray] Failed to restore the attachment draft:', caughtError);
            });

        return () => {
            isEffectActive = false;
        };
    }, [chatId]);

    useEffect(() => {
        saveAttachmentDraft(chatId, trayEntries);
    }, [chatId, trayEntries]);

    const stagedAttachmentIds = useMemo(() => {
        return trayEntries
            .filter((entry) => entry.status === READY && entry.attachmentId)
            .map((entry) => entry.attachmentId);
    }, [trayEntries]);

    const hasPendingUploads = useMemo(() => {
        return trayEntries.some((entry) => entry.status === UPLOADING);
    }, [trayEntries]);

    return {
        trayEntries,
        addFiles,
        removeEntry,
        retryEntry,
        setEntryCaption,
        commitCaptions,
        stagedAttachmentIds,
        hasPendingUploads,
        clearTray,
        restoreTray,
        trayError,
        setTrayError,
    };
}

export default useAttachmentTray;
