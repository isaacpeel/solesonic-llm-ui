import AttachmentThumbnail from './AttachmentThumbnail.jsx';
import useAttachmentUrl from '../../hooks/useAttachmentUrl.js';
import './MessageAttachments.css';

/*
 * The backend reports a failed vision or extraction pass explicitly rather than just leaving
 * the answer degraded with no signal — `described`/`indexed` are only ever `false` once the
 * turn has actually finished that pass, so `undefined` (still in flight, or an attachment from
 * before the backend sent this field at all) must not read as a failure.
 */
function attachmentWarning(attachment) {
    if (attachment.described === false) {
        return attachment.reason || 'The assistant may not have been able to read this image.';
    }

    if (attachment.indexed === false) {
        return attachment.extractionReason || 'This document could not be indexed for retrieval.';
    }

    return undefined;
}

/*
 * One thumbnail on a sent message. Split out so each attachment gets its own
 * useAttachmentUrl subscription — hooks cannot be called from inside a map body.
 */
function MessageAttachment({attachment, onExpand}) {
    const {objectUrl, loading, error} = useAttachmentUrl(attachment.id, {
        localObjectUrl: attachment.localObjectUrl,
    });

    if (error) {
        return (
            <AttachmentThumbnail
                fileName={attachment.fileName}
                unavailable={true}
            />
        );
    }

    return (
        <AttachmentThumbnail
            objectUrl={objectUrl}
            fileName={attachment.fileName}
            contentType={attachment.contentType}
            description={attachment.description}
            status={loading ? 'uploading' : 'ready'}
            warning={attachmentWarning(attachment)}
            onExpand={objectUrl && onExpand ? () => onExpand({...attachment, objectUrl}) : undefined}
        />
    );
}

function MessageAttachments({attachments, onExpand}) {
    const attachmentList = Array.isArray(attachments) ? attachments : [];

    if (attachmentList.length === 0) {
        return null;
    }

    return (
        <div className="message-attachments">
            {attachmentList.map((attachment) => (
                <MessageAttachment
                    key={attachment.id}
                    attachment={attachment}
                    onExpand={onExpand}
                />
            ))}
        </div>
    );
}

export default MessageAttachments;
