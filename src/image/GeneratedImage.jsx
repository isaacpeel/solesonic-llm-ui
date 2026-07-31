import {useCallback, useEffect, useRef, useState} from 'react';
import log from 'loglevel';
import {ArrowDownTrayIcon, ArrowPathIcon, ClipboardIcon} from '@heroicons/react/20/solid';
import useGeneratedImageUrl from '../hooks/useGeneratedImageUrl.js';
import './GeneratedImage.css';

const COPY_CONFIRMATION_MILLISECONDS = 2000;

/*
 * Output is always square, so the frame reserves its final aspect ratio up front and the
 * image drops in without reflowing anything below it.
 */
function buildDownloadFileName(prompt, imageId) {
    const promptSlug = (prompt || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);

    const idSuffix = (imageId || '').slice(0, 8);

    if (!promptSlug) {
        return `generated-image-${idSuffix || 'png'}.png`;
    }

    return idSuffix ? `${promptSlug}-${idSuffix}.png` : `${promptSlug}.png`;
}

function canCopyImagesToClipboard() {
    return typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;
}

/**
 * The single rendering path for a generated image — used by the explicit generation panel
 * today and by assistant turns once agentic generation ships, so both look identical.
 *
 * `onRegenerate` is optional: an image sitting in chat scrollback has no prompt box to
 * re-run, and the action is hidden rather than shown disabled.
 */
function GeneratedImage({image, onRegenerate, regenerating = false}) {
    const [isVisible, setIsVisible] = useState(typeof IntersectionObserver === 'undefined');
    const [isMetadataOpen, setIsMetadataOpen] = useState(false);
    const [copyState, setCopyState] = useState(null);
    const frameRef = useRef(null);

    const {objectUrl, loading, error} = useGeneratedImageUrl(image?.imageId, {deferred: !isVisible});

    /* §7.8 — scrollback images fetch their bytes only once they are about to be seen. */
    useEffect(() => {
        if (isVisible || !frameRef.current) {
            return undefined;
        }

        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                setIsVisible(true);
            }
        }, {rootMargin: '200px'});

        observer.observe(frameRef.current);

        return () => observer.disconnect();
    }, [isVisible]);

    useEffect(() => {
        if (!copyState) {
            return undefined;
        }

        const timeoutId = setTimeout(() => setCopyState(null), COPY_CONFIRMATION_MILLISECONDS);

        return () => clearTimeout(timeoutId);
    }, [copyState]);

    const handleDownload = useCallback(() => {
        if (!objectUrl) {
            return;
        }

        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = objectUrl;
        downloadAnchor.download = buildDownloadFileName(image?.prompt, image?.imageId);

        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        document.body.removeChild(downloadAnchor);
    }, [image?.imageId, image?.prompt, objectUrl]);

    const handleCopy = useCallback(async () => {
        if (!objectUrl) {
            return;
        }

        try {
            /* The blob URL is same-origin, so this re-reads the cached bytes without a network call. */
            const blobResponse = await fetch(objectUrl);
            const imageBlob = await blobResponse.blob();

            await navigator.clipboard.write([new ClipboardItem({[imageBlob.type || 'image/png']: imageBlob})]);
            setCopyState('copied');
        } catch (caughtError) {
            log.error('[GeneratedImage] Failed to copy image:', caughtError);
            setCopyState('failed');
        }
    }, [objectUrl]);

    if (!image?.imageId) {
        return null;
    }

    const altText = image.prompt || 'Generated image';
    const hasMetadata = image.seed !== null && image.seed !== undefined
        || image.elapsedSeconds !== null && image.elapsedSeconds !== undefined;

    return (
        <div className="generated-image">
            <div className="generated-image-frame" ref={frameRef}>
                {objectUrl && (
                    <img
                        className="generated-image-picture"
                        src={objectUrl}
                        alt={altText}
                        loading="lazy"
                    />
                )}

                {loading && (
                    <div className="generated-image-frame-status" role="status">
                        <span className="generated-image-spinner" aria-label="Loading image"/>
                    </div>
                )}

                {error && (
                    <div className="generated-image-frame-status generated-image-frame-status--error">
                        <span className="generated-image-unavailable-text">
                            {error === 'missing' ? 'This image is no longer available.' : 'This image could not be loaded.'}
                        </span>
                    </div>
                )}
            </div>

            <div className="generated-image-actions">
                <button
                    type="button"
                    className="generated-image-action"
                    onClick={handleDownload}
                    disabled={!objectUrl}
                >
                    <ArrowDownTrayIcon aria-hidden="true"/>
                    Download
                </button>

                {canCopyImagesToClipboard() && (
                    <button
                        type="button"
                        className="generated-image-action"
                        onClick={handleCopy}
                        disabled={!objectUrl}
                    >
                        <ClipboardIcon aria-hidden="true"/>
                        {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
                    </button>
                )}

                {onRegenerate && (
                    <button
                        type="button"
                        className="generated-image-action"
                        onClick={onRegenerate}
                        disabled={regenerating}
                    >
                        <ArrowPathIcon aria-hidden="true"/>
                        Regenerate
                    </button>
                )}

                {hasMetadata && (
                    <button
                        type="button"
                        className="generated-image-action generated-image-action--metadata"
                        onClick={() => setIsMetadataOpen((previousValue) => !previousValue)}
                        aria-expanded={isMetadataOpen}
                        aria-controls={`generated-image-metadata-${image.imageId}`}
                    >
                        Details
                        <span
                            className={`generated-image-chevron ${isMetadataOpen ? 'generated-image-chevron--expanded' : ''}`}
                            aria-hidden="true"
                        >
                            ▾
                        </span>
                    </button>
                )}
            </div>

            {/*
              * Seed and elapsed time are a support/provenance artifact, not something most
              * users want inline — the seed is what lets someone name "this specific image".
              */}
            {hasMetadata && isMetadataOpen && (
                <dl className="generated-image-metadata" id={`generated-image-metadata-${image.imageId}`}>
                    {image.seed !== null && image.seed !== undefined && (
                        <div className="generated-image-metadata-row">
                            <dt>Seed</dt>
                            <dd>{String(image.seed)}</dd>
                        </div>
                    )}

                    {image.width && image.height && (
                        <div className="generated-image-metadata-row">
                            <dt>Size</dt>
                            <dd>{image.width}×{image.height}</dd>
                        </div>
                    )}

                    {image.steps !== null && image.steps !== undefined && (
                        <div className="generated-image-metadata-row">
                            <dt>Steps</dt>
                            <dd>{image.steps}</dd>
                        </div>
                    )}

                    {image.elapsedSeconds !== null && image.elapsedSeconds !== undefined && (
                        <div className="generated-image-metadata-row">
                            <dt>Elapsed</dt>
                            <dd>{image.elapsedSeconds}s</dd>
                        </div>
                    )}
                </dl>
            )}
        </div>
    );
}

export default GeneratedImage;
