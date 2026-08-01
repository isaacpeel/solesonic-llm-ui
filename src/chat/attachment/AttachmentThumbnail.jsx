import {ArrowPathIcon, ExclamationTriangleIcon, XMarkIcon} from '@heroicons/react/20/solid';
import './AttachmentThumbnail.css';

const UPLOADING = 'uploading';
const FAILED = 'failed';

function AttachmentThumbnail({
    objectUrl,
    fileName,
    description,
    status,
    warning,
    unavailable = false,
    onRemove,
    onRetry,
    onExpand,
}) {
    const altText = description || fileName || 'Attached image';

    if (unavailable) {
        return (
            <div className="attachment-thumbnail attachment-thumbnail--unavailable" title={fileName}>
                <span className="attachment-thumbnail-unavailable-text">Image no longer available</span>
            </div>
        );
    }

    return (
        <div className="attachment-thumbnail">
            {onExpand ? (
                <button
                    type="button"
                    className="attachment-thumbnail-expand"
                    onClick={onExpand}
                    aria-label={`Expand ${fileName || 'image'}`}
                >
                    <img className="attachment-thumbnail-image" src={objectUrl} alt={altText}/>
                </button>
            ) : (
                <img className="attachment-thumbnail-image" src={objectUrl} alt={altText}/>
            )}

            {status === UPLOADING && (
                <div className="attachment-thumbnail-overlay" role="status" aria-label={`Uploading ${fileName || 'image'}`}>
                    <span className="attachment-thumbnail-spinner"/>
                </div>
            )}

            {status === FAILED && (
                <button
                    type="button"
                    className="attachment-thumbnail-overlay attachment-thumbnail-retry"
                    onClick={onRetry}
                    aria-label={`Retry uploading ${fileName || 'image'}`}
                >
                    <ArrowPathIcon/>
                </button>
            )}

            {warning && status !== FAILED && (
                <span className="attachment-thumbnail-warning" title={warning} aria-label={warning}>
                    <ExclamationTriangleIcon/>
                </span>
            )}

            {onRemove && (
                <button
                    type="button"
                    className="attachment-thumbnail-remove"
                    onClick={onRemove}
                    aria-label={`Remove ${fileName || 'image'}`}
                >
                    <XMarkIcon/>
                </button>
            )}
        </div>
    );
}

export default AttachmentThumbnail;
