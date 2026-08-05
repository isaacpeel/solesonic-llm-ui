import {ExclamationTriangleIcon, PencilSquareIcon, XMarkIcon} from '@heroicons/react/20/solid';
import AttachmentThumbnail from './AttachmentThumbnail.jsx';
import useAttachmentUrl from '../../hooks/useAttachmentUrl.js';
import './AttachmentTray.css';

const READY = 'ready';
const UPLOADING = 'uploading';

/*
 * One tray entry, rendered as a chip: preview, file name, then its own controls. A freshly-picked
 * entry has its bytes locally and short-circuits the hook; an entry restored from a
 * sessionStorage draft has only an id and resolves like history.
 */
function AttachmentTrayItem({
    entry,
    isCaptionOpen,
    onToggleCaption,
    onRemoveEntry,
    onRetryEntry,
}) {
    const {objectUrl, loading} = useAttachmentUrl(entry.attachmentId, {
        localObjectUrl: entry.localObjectUrl,
    });

    const thumbnailStatus = loading && entry.status === READY ? UPLOADING : entry.status;

    return (
        <div className="composer-attachment-tray-item">
            <div className="composer-attachment-chip">
                {/*
                  * The chip owns removal so the control sits at the chip's trailing edge rather
                  * than floating over a 22px preview; the thumbnail keeps the upload and retry
                  * states, which do belong on the image.
                  */}
                <AttachmentThumbnail
                    objectUrl={objectUrl}
                    fileName={entry.fileName}
                    description={entry.caption}
                    status={thumbnailStatus}
                    onRetry={() => onRetryEntry(entry.trayKey)}
                />

                <span className="composer-attachment-chip-name" title={entry.fileName}>
                    {entry.fileName}
                </span>

                {entry.warning && (
                    <span className="composer-attachment-chip-warning" title={entry.warning} aria-label={entry.warning}>
                        <ExclamationTriangleIcon/>
                    </span>
                )}

                {/* A restored draft entry has no retained File, so its caption cannot be re-staged. */}
                {entry.status === READY && !entry.restoredFromDraft && (
                    <button
                        type="button"
                        className={`composer-attachment-note-toggle${isCaptionOpen ? ' composer-attachment-note-toggle--open' : ''}`}
                        onClick={() => onToggleCaption(entry.trayKey)}
                        aria-expanded={isCaptionOpen}
                        aria-label={`Add a note to ${entry.fileName}`}
                        title={entry.caption ? 'Edit note' : 'Add a note'}
                    >
                        <PencilSquareIcon/>
                    </button>
                )}

                <button
                    type="button"
                    className="composer-attachment-chip-remove"
                    onClick={() => onRemoveEntry(entry.trayKey)}
                    aria-label={`Remove ${entry.fileName}`}
                >
                    <XMarkIcon/>
                </button>
            </div>

            {entry.errorMessage && (
                <span className="composer-attachment-error">{entry.errorMessage}</span>
            )}
        </div>
    );
}

function AttachmentTray({
    trayEntries,
    openCaptionTrayKey,
    onToggleCaption,
    onRemoveEntry,
    onRetryEntry,
}) {
    if (!Array.isArray(trayEntries) || trayEntries.length === 0) {
        return null;
    }

    return (
        <div className="composer-attachment-tray">
            {trayEntries.map((entry) => (
                <AttachmentTrayItem
                    key={entry.trayKey}
                    entry={entry}
                    isCaptionOpen={openCaptionTrayKey === entry.trayKey}
                    onToggleCaption={onToggleCaption}
                    onRemoveEntry={onRemoveEntry}
                    onRetryEntry={onRetryEntry}
                />
            ))}
        </div>
    );
}

export default AttachmentTray;
