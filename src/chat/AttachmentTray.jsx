import AttachmentThumbnail from './AttachmentThumbnail.jsx';
import useAttachmentUrl from '../hooks/useAttachmentUrl.js';
import './AttachmentTray.css';

const READY = 'ready';
const UPLOADING = 'uploading';

/*
 * One tray entry. A freshly-picked entry has its bytes locally and short-circuits the hook;
 * an entry restored from a sessionStorage draft has only an id and resolves like history.
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
            <AttachmentThumbnail
                objectUrl={objectUrl}
                fileName={entry.fileName}
                description={entry.caption}
                status={thumbnailStatus}
                warning={entry.warning}
                onRemove={() => onRemoveEntry(entry.trayKey)}
                onRetry={() => onRetryEntry(entry.trayKey)}
            />

            {/* A restored draft entry has no retained File, so its caption cannot be re-staged. */}
            {entry.status === READY && !entry.restoredFromDraft && (
                <button
                    type="button"
                    className={`composer-attachment-note-toggle${isCaptionOpen ? ' composer-attachment-note-toggle--open' : ''}`}
                    onClick={() => onToggleCaption(entry.trayKey)}
                    aria-expanded={isCaptionOpen}
                    aria-label={`Add a note to ${entry.fileName}`}
                >
                    {entry.caption ? '✎ note' : '＋ note'}
                </button>
            )}

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
