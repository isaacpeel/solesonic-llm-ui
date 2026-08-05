import {useEffect, useState} from 'react';
import log from 'loglevel';
import {acquireGeneratedImageObjectUrl, releaseGeneratedImageObjectUrl} from '../util/generatedImageObjectUrlCache.js';

/**
 * Resolves a generated image id to a displayable blob URL.
 *
 * `deferred` holds the fetch back until the caller says the image is worth loading — that
 * is how §7.8's lazy-load below the fold is honoured for images sitting in scrollback.
 */
function useGeneratedImageUrl(imageId, {deferred = false} = {}) {
    const [objectUrl, setObjectUrl] = useState(/** @type {string | null} */ (null));
    const [loading, setLoading] = useState(!deferred && !!imageId);
    const [error, setError] = useState(/** @type {string | null} */ (null));

    useEffect(() => {
        if (!imageId || deferred) {
            setObjectUrl(null);
            setLoading(false);
            setError(null);

            return undefined;
        }

        let isEffectActive = true;

        setLoading(true);
        setError(null);

        acquireGeneratedImageObjectUrl(imageId)
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

                log.error('[useGeneratedImageUrl] Failed to load generated image:', caughtError);

                setObjectUrl(null);
                setLoading(false);
                setError(caughtError?.status === 404 ? 'missing' : 'failed');
            });

        return () => {
            isEffectActive = false;
            releaseGeneratedImageObjectUrl(imageId);
        };
    }, [imageId, deferred]);

    return {objectUrl, loading, error};
}

export default useGeneratedImageUrl;
