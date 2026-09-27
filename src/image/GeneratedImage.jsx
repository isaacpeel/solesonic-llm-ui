import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowsPointingOutIcon} from '@heroicons/react/20/solid';
import useGeneratedImageUrl from '../hooks/useGeneratedImageUrl.js';
import MessageCopyButton from '../chat/message/MessageCopyButton.jsx';
import './GeneratedImage.css';

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

/**
 * The single rendering path for a generated image — used by the explicit generation panel
 * today and by assistant turns once agentic generation ships, so both look identical.
 *
 * `onExpand` is optional: the "Full size" action only appears when a caller can host the
 * lightbox it hands the loaded bytes to.
 */
function GeneratedImage({image, onExpand}) {
    const [isVisible, setIsVisible] = useState(typeof IntersectionObserver === 'undefined');
    const [isMetadataOpen, setIsMetadataOpen] = useState(false);
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

    const handleExpand = useCallback(() => {
        if (!objectUrl || !onExpand) {
            return;
        }

        /*
         * The lightbox is shared with chat attachments, so the image is handed over in that
         * shape — the prompt reads as the caption there.
         */
        onExpand({
            objectUrl,
            description: image?.prompt,
            fileName: buildDownloadFileName(image?.prompt, image?.imageId),
        });
    }, [image?.imageId, image?.prompt, objectUrl, onExpand]);

    if (!image?.imageId) {
        return null;
    }

    if (!image?.imageId) {
        return null;
    }

    const altText = image.prompt || 'Generated image';
    const hasMetadata = Boolean(image.prompt)
        || (image.seed !== null && image.seed !== undefined)
        || (image.elapsedSeconds !== null && image.elapsedSeconds !== undefined);

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
                {onExpand && (
                    <button
                        type="button"
                        className="generated-image-action"
                        onClick={handleExpand}
                        disabled={!objectUrl}
                    >
                        <ArrowsPointingOutIcon aria-hidden="true"/>
                        Full size
                    </button>
                )}

                {hasMetadata && (
                    <button
                        type="button"
                        className="generated-image-action"
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
                    {image.prompt && (
                        <div className="generated-image-metadata-row">
                            <dt className="generated-image-metadata-prompt-label">
                                Prompt<MessageCopyButton text={image.prompt}/>
                            </dt>
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