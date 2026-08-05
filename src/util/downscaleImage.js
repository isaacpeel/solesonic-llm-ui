import log from 'loglevel';
import {MAX_VISION_BYTES} from './imageValidation.js';

export const MAX_LONGEST_EDGE_PIXELS = 2048;

/*
 * Canvas re-encoding flattens an animated GIF to a single frame, so GIFs are never
 * downscaled — a still frame of an animation is a worse artifact than an oversized file.
 */
const CONTENT_TYPES_EXEMPT_FROM_DOWNSCALE = ['image/gif'];

/** @returns {Promise<HTMLImageElement>} */
function loadImageElement(objectUrl) {
    return new Promise((resolve, reject) => {
        const imageElement = new Image();

        imageElement.onload = () => resolve(imageElement);
        imageElement.onerror = () => reject(new Error('The image could not be decoded'));
        imageElement.src = objectUrl;
    });
}

function canvasToBlob(canvasElement, contentType) {
    return new Promise((resolve, reject) => {
        canvasElement.toBlob(
            (encodedBlob) => {
                if (encodedBlob) {
                    resolve(encodedBlob);
                    return;
                }

                reject(new Error('The image could not be re-encoded'));
            },
            contentType
        );
    });
}

function scaledDimensions(naturalWidth, naturalHeight) {
    const longestEdge = Math.max(naturalWidth, naturalHeight);

    if (longestEdge <= MAX_LONGEST_EDGE_PIXELS) {
        return {width: naturalWidth, height: naturalHeight};
    }

    const scaleFactor = MAX_LONGEST_EDGE_PIXELS / longestEdge;

    return {
        width: Math.max(1, Math.round(naturalWidth * scaleFactor)),
        height: Math.max(1, Math.round(naturalHeight * scaleFactor)),
    };
}

/**
 * Returns a downscaled File when the candidate is over the vision limit and can safely be
 * re-encoded; otherwise returns the original file unchanged. Never rejects — a failed
 * downscale falls back to uploading the original, which the 5MB warning already covers.
 */
export async function downscaleImage(candidateFile) {
    if (!candidateFile || candidateFile.size <= MAX_VISION_BYTES) {
        return candidateFile;
    }

    if (CONTENT_TYPES_EXEMPT_FROM_DOWNSCALE.includes(candidateFile.type)) {
        return candidateFile;
    }

    let objectUrl = null;

    try {
        objectUrl = URL.createObjectURL(candidateFile);

        const imageElement = await loadImageElement(objectUrl);
        const {width, height} = scaledDimensions(imageElement.naturalWidth, imageElement.naturalHeight);

        const canvasElement = document.createElement('canvas');
        canvasElement.width = width;
        canvasElement.height = height;

        const drawingContext = canvasElement.getContext('2d');

        if (!drawingContext) {
            return candidateFile;
        }

        drawingContext.drawImage(imageElement, 0, 0, width, height);

        /* The explicit type matters — without it canvas silently re-encodes to PNG. */
        const encodedBlob = await canvasToBlob(canvasElement, candidateFile.type);

        if (encodedBlob.size >= candidateFile.size) {
            return candidateFile;
        }

        return new File([encodedBlob], candidateFile.name, {
            type: candidateFile.type,
            lastModified: candidateFile.lastModified,
        });
    } catch (caughtError) {
        log.error('[downscaleImage] Falling back to the original file:', caughtError);

        return candidateFile;
    } finally {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
    }
}

export default downscaleImage;
