import apiClient from '../client/ApiClient.js';
import config from '../properties/ApplicationProperties';
import authService from './AuthService.js';
import {parseSseStream} from '../client/parseSseStream.js';

export const PROGRESS = 'progress';
export const COMPLETE = 'complete';
export const GENERATION_ERROR = 'error';

export const INVALID_PROMPT = 'INVALID_PROMPT';
export const GENERATION_TIMEOUT = 'GENERATION_TIMEOUT';
export const BACKEND_UNAVAILABLE = 'BACKEND_UNAVAILABLE';
export const FORBIDDEN = 'FORBIDDEN';
export const RATE_LIMITED = 'RATE_LIMITED';
export const INTERNAL = 'INTERNAL';

/*
 * The backend's message text can name a ComfyUI prompt id and internal host behaviour, so
 * it is never shown as-is. These are the only strings a user sees for a failed generation.
 */
const USER_FACING_MESSAGES = {
    [INVALID_PROMPT]: 'That prompt could not be used. Try describing the image in a sentence or two.',
    [GENERATION_TIMEOUT]: 'This is taking longer than expected. The image generator did not finish in time.',
    [BACKEND_UNAVAILABLE]: 'The image generator is unavailable right now. Please try again in a moment.',
    [FORBIDDEN]: 'You do not have access to image generation.',
    [RATE_LIMITED]: 'Too many images are being generated right now. Please try again shortly.',
    [INTERNAL]: 'Something went wrong while generating the image.',
};

/*
 * The server enforces a 180s hard deadline. Abort above it so a wedged connection cannot
 * hang the UI forever, while never abandoning a request the server is still working on.
 */
const CLIENT_TIMEOUT_MILLISECONDS = 200000;

export class ImageGenerationError extends Error {
    constructor(code, message) {
        super(message || USER_FACING_MESSAGES[code] || USER_FACING_MESSAGES[INTERNAL]);
        this.name = 'ImageGenerationError';
        this.code = code;
    }
}

export function userFacingMessageForErrorCode(errorCode) {
    return USER_FACING_MESSAGES[errorCode] || USER_FACING_MESSAGES[INTERNAL];
}

/**
 * Collapses a transport-level failure into the one error type callers have to handle. A
 * caller-driven abort is a cancel rather than a failure, so it passes through untouched.
 */
function toImageGenerationError(caughtError, callerAborted) {
    if (caughtError?.name === 'AbortError') {
        return callerAborted ? caughtError : new ImageGenerationError(GENERATION_TIMEOUT);
    }

    console.error('[ImageGenerationService] Stream failed:', caughtError);

    return new ImageGenerationError(BACKEND_UNAVAILABLE);
}

function errorCodeForHttpStatus(responseStatus) {
    if (responseStatus === 400 || responseStatus === 422) {
        return INVALID_PROMPT;
    }

    if (responseStatus === 401 || responseStatus === 403) {
        return FORBIDDEN;
    }

    if (responseStatus === 429) {
        return RATE_LIMITED;
    }

    if (responseStatus === 502 || responseStatus === 503 || responseStatus === 504) {
        return BACKEND_UNAVAILABLE;
    }

    return INTERNAL;
}

/**
 * Normalizes an image reference into the shape the rendering path consumes — whether it came
 * from a `complete` frame or off a persisted chat message. The API is the one that
 * content-addresses and stores the PNG (§4 of the integration plan), so the UI only ever
 * holds a reference — never base64.
 */
export function normalizeGeneratedImage(completePayload, promptFallback) {
    return {
        imageId: completePayload?.imageId ?? completePayload?.id ?? null,
        imageUrl: completePayload?.imageUrl ?? null,
        prompt: completePayload?.prompt || promptFallback || '',
        seed: completePayload?.seed ?? null,
        width: completePayload?.width ?? 1024,
        height: completePayload?.height ?? 1024,
        steps: completePayload?.steps ?? null,
        elapsedSeconds: completePayload?.elapsedSeconds ?? null,
    };
}

const imageGenerationService = {
    /**
     * Single event router for the generation stream, mirroring `chatService.handleStreamChunk`.
     * `prompt` is threaded through so a `complete` frame that omits it still yields alt text.
     */
    handleGenerationEvent: (eventPayload, {prompt, onProgress, onComplete, onFailure} = {}) => {
        switch (eventPayload?.event) {
            case PROGRESS:
                try {
                    const progressPayload = JSON.parse(eventPayload.data);

                    onProgress?.({
                        percent: typeof progressPayload?.percent === 'number' ? progressPayload.percent : null,
                        message: typeof progressPayload?.message === 'string' ? progressPayload.message : '',
                    });
                } catch (parseError) {
                    console.error('[ImageGenerationService] Failed to parse progress payload:', parseError);
                }
                break;
            case COMPLETE:
                try {
                    const completePayload = JSON.parse(eventPayload.data);

                    onComplete?.(normalizeGeneratedImage(completePayload, prompt));
                } catch (parseError) {
                    console.error('[ImageGenerationService] Failed to parse complete payload:', parseError);
                    onFailure?.(new ImageGenerationError(INTERNAL));
                }
                break;
            case GENERATION_ERROR:
                try {
                    const errorPayload = JSON.parse(eventPayload.data);
                    const errorCode = errorPayload?.code || INTERNAL;

                    /* Deliberately drops errorPayload.message — see USER_FACING_MESSAGES. */
                    console.error('[ImageGenerationService] Generation failed:', errorCode, errorPayload?.message);
                    onFailure?.(new ImageGenerationError(errorCode));
                } catch (parseError) {
                    console.error('[ImageGenerationService] Failed to parse error payload:', parseError);
                    onFailure?.(new ImageGenerationError(INTERNAL));
                }
                break;
        }
    },

    /**
     * Opens the generation stream and pumps every frame at `onEvent`. Returns once the
     * stream reaches a terminal frame; throws `ImageGenerationError` for transport-level
     * failures so callers have exactly one error type to map.
     */
    generateImageStream: async (prompt, {onEvent, signal} = {}) => {
        const token = await authService.getAccessToken();

        const requestHeaders = {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
        };

        if (token) {
            requestHeaders.Authorization = `Bearer ${token}`;
        }

        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), CLIENT_TIMEOUT_MILLISECONDS);

        const abortTimeoutOnCallerAbort = () => timeoutController.abort();
        signal?.addEventListener('abort', abortTimeoutOnCallerAbort);

        try {
            let response;

            try {
                response = await fetch(config.imagesUri, {
                    method: 'POST',
                    body: JSON.stringify({prompt}),
                    signal: timeoutController.signal,
                    headers: requestHeaders,
                });
            } catch (caughtError) {
                throw toImageGenerationError(caughtError, !!signal?.aborted);
            }

            if (!response.ok) {
                throw new ImageGenerationError(errorCodeForHttpStatus(response.status));
            }

            try {
                for await (const event of parseSseStream(response.body)) {
                    onEvent?.(event);

                    if (event.event === COMPLETE || event.event === GENERATION_ERROR) {
                        return;
                    }
                }
            } catch (caughtError) {
                throw toImageGenerationError(caughtError, !!signal?.aborted);
            }
        } finally {
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', abortTimeoutOnCallerAbort);
        }
    },

    fetchGeneratedImageBlob: async (imageId) => {
        return await apiClient.getBlob(`${config.imagesUri}/${imageId}`);
    },
};

export default imageGenerationService;
