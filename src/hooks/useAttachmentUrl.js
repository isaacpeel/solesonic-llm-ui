import {useEffect, useState} from 'react';
import log from 'loglevel';
import {acquireAttachmentObjectUrl, releaseAttachmentObjectUrl} from '../util/attachmentObjectUrlCache.js';

/**
 * Resolves an attachment id to a displayable URL.
 *
 * A `localObjectUrl` short-circuits entirely — a just-uploaded image already has its bytes in
 * the browser, so there is nothing to fetch and no cache entry to take a reference on.
 */
function useAttachmentUrl(attachmentId, {localObjectUrl} = {}) {
    const [objectUrl, setObjectUrl] = useState(localObjectUrl || null);
    const [loading, setLoading] = useState(!localObjectUrl && !!attachmentId);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (localObjectUrl) {
            setObjectUrl(localObjectUrl);
            setLoading(false);
            setError(null);

            return undefined;
        }

        if (!attachmentId) {
            setObjectUrl(null);
            setLoading(false);
            setError(null);

            return undefined;
        }

        let isEffectActive = true;

        setLoading(true);
        setError(null);

        acquireAttachmentObjectUrl(attachmentId)
            .then((resolvedObjectUrl) => {
                if (!isEffectActive) {
                    return;
                }

                setObjectUrl(resolvedObjectUrl);
                setLoading(false);
            })
            .catch((caughtError) => {
                if (!isEffectActive) {
                    return;
                }

                log.error('[useAttachmentUrl] Failed to load attachment:', caughtError);

                setObjectUrl(null);
                setLoading(false);
                setError(caughtError?.status === 404 ? 'missing' : 'failed');
            });

        return () => {
            isEffectActive = false;
            releaseAttachmentObjectUrl(attachmentId);
        };
    }, [attachmentId, localObjectUrl]);

    return {objectUrl, loading, error};
}

export default useAttachmentUrl;
