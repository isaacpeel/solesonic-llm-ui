import AttachmentThumbnail from './AttachmentThumbnail.jsx';
import useAttachmentUrl from '../../hooks/useAttachmentUrl.js';
import './MessageAttachments.css';

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
            description={attachment.description}
            status={loading ? 'uploading' : 'ready'}
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
