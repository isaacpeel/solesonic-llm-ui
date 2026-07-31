import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('../../src/client/ApiClient.js', () => ({
    default: {
        getBlob: vi.fn(),
    },
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {imagesUri: 'http://api.test/images'},
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getAccessToken: vi.fn(),
    },
}));

import imageGenerationService, {
    BACKEND_UNAVAILABLE,
    FORBIDDEN,
    ImageGenerationError,
    INTERNAL,
    INVALID_PROMPT,
    normalizeGeneratedImage,
    RATE_LIMITED,
    userFacingMessageForErrorCode,
} from '../../src/service/ImageGenerationService.js';
import apiClient from '../../src/client/ApiClient.js';
import authService from '../../src/service/AuthService.js';

function streamingResponse(sseText) {
    const encodedText = new TextEncoder().encode(sseText);
    let hasBeenRead = false;

    return {
        ok: true,
        status: 200,
        body: {
            getReader: () => ({
                read: async () => {
                    if (hasBeenRead) {
                        return {done: true, value: undefined};
                    }

                    hasBeenRead = true;

                    return {done: false, value: encodedText};
                },
                releaseLock: () => {},
            }),
        },
    };
}

beforeEach(() => {
    authService.getAccessToken.mockResolvedValue('token-1');
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('handleGenerationEvent', () => {
    it('routes a progress frame with its percent and message', () => {
        const onProgress = vi.fn();

        imageGenerationService.handleGenerationEvent(
            {event: 'progress', data: JSON.stringify({percent: 15, message: 'Queued as 4f1c8e2a'})},
            {onProgress}
        );

        expect(onProgress).toHaveBeenCalledWith({percent: 15, message: 'Queued as 4f1c8e2a'});
    });

    it('tolerates a progress frame with no percent', () => {
        const onProgress = vi.fn();

        imageGenerationService.handleGenerationEvent(
            {event: 'progress', data: JSON.stringify({message: 'Generating…'})},
            {onProgress}
        );

        expect(onProgress).toHaveBeenCalledWith({percent: null, message: 'Generating…'});
    });

    it('routes a complete frame as a normalized image reference', () => {
        const onComplete = vi.fn();

        imageGenerationService.handleGenerationEvent(
            {
                event: 'complete',
                data: JSON.stringify({
                    imageId: 'image-1',
                    imageUrl: '/api/images/image-1',
                    prompt: 'a lighthouse',
                    seed: 8339331079448168597,
                    width: 1024,
                    height: 1024,
                    elapsedSeconds: 8.2,
                }),
            },
            {onComplete}
        );

        expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
            imageId: 'image-1',
            imageUrl: '/api/images/image-1',
            prompt: 'a lighthouse',
            width: 1024,
            height: 1024,
            elapsedSeconds: 8.2,
        }));
    });

    it('falls back to the submitted prompt when the complete frame omits one', () => {
        const onComplete = vi.fn();

        imageGenerationService.handleGenerationEvent(
            {event: 'complete', data: JSON.stringify({imageId: 'image-1'})},
            {prompt: 'a lighthouse', onComplete}
        );

        expect(onComplete.mock.calls[0][0].prompt).toBe('a lighthouse');
    });

    it('maps an error frame to its code and never leaks the raw server message', () => {
        const onFailure = vi.fn();

        imageGenerationService.handleGenerationEvent(
            {
                event: 'error',
                data: JSON.stringify({
                    code: 'GENERATION_TIMEOUT',
                    message: 'ComfyUI generation 4f1c8e2a did not finish within 180s',
                }),
            },
            {onFailure}
        );

        const reportedError = onFailure.mock.calls[0][0];
        expect(reportedError).toBeInstanceOf(ImageGenerationError);
        expect(reportedError.code).toBe('GENERATION_TIMEOUT');
        expect(reportedError.message).not.toContain('4f1c8e2a');
        expect(reportedError.message).not.toContain('ComfyUI');
    });

    it('falls back to INTERNAL for an error frame carrying no code', () => {
        const onFailure = vi.fn();

        imageGenerationService.handleGenerationEvent(
            {event: 'error', data: JSON.stringify({})},
            {onFailure}
        );

        expect(onFailure.mock.calls[0][0].code).toBe(INTERNAL);
    });

    it('reports a failure rather than throwing on unparseable complete data', () => {
        const onComplete = vi.fn();
        const onFailure = vi.fn();

        imageGenerationService.handleGenerationEvent(
            {event: 'complete', data: 'not-json'},
            {onComplete, onFailure}
        );

        expect(onComplete).not.toHaveBeenCalled();
        expect(onFailure.mock.calls[0][0].code).toBe(INTERNAL);
    });

    it('ignores an unrecognised event name', () => {
        const onProgress = vi.fn();
        const onComplete = vi.fn();
        const onFailure = vi.fn();

        imageGenerationService.handleGenerationEvent({event: 'init', data: '{}'}, {onProgress, onComplete, onFailure});

        expect(onProgress).not.toHaveBeenCalled();
        expect(onComplete).not.toHaveBeenCalled();
        expect(onFailure).not.toHaveBeenCalled();
    });
});

describe('generateImageStream', () => {
    it('posts the prompt with a bearer token and an event-stream Accept header', async () => {
        const fetchMock = vi.fn().mockResolvedValue(streamingResponse('event: complete\ndata: {"imageId":"image-1"}\n\n'));
        vi.stubGlobal('fetch', fetchMock);

        await imageGenerationService.generateImageStream('a lighthouse', {onEvent: () => {}});

        const [calledUri, calledInit] = fetchMock.mock.calls[0];
        expect(calledUri).toBe('http://api.test/images');
        expect(calledInit.method).toBe('POST');
        expect(JSON.parse(calledInit.body)).toEqual({prompt: 'a lighthouse'});
        expect(calledInit.headers.Authorization).toBe('Bearer token-1');
        expect(calledInit.headers.Accept).toBe('text/event-stream');
    });

    it('pumps every frame at onEvent and stops on complete', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamingResponse(
            'event: progress\ndata: {"percent":15,"message":"Queued"}\n\n'
            + 'event: complete\ndata: {"imageId":"image-1"}\n\n'
            + 'event: progress\ndata: {"percent":100,"message":"after the end"}\n\n'
        )));

        const seenEvents = [];
        await imageGenerationService.generateImageStream('a lighthouse', {
            onEvent: (event) => seenEvents.push(event.event),
        });

        expect(seenEvents).toEqual(['progress', 'complete']);
    });

    it('stops on an error frame', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamingResponse(
            'event: error\ndata: {"code":"GENERATION_TIMEOUT"}\n\n'
            + 'event: progress\ndata: {"percent":50}\n\n'
        )));

        const seenEvents = [];
        await imageGenerationService.generateImageStream('a lighthouse', {
            onEvent: (event) => seenEvents.push(event.event),
        });

        expect(seenEvents).toEqual(['error']);
    });

    it.each([
        [400, INVALID_PROMPT],
        [403, FORBIDDEN],
        [429, RATE_LIMITED],
        [503, BACKEND_UNAVAILABLE],
        [500, INTERNAL],
    ])('maps HTTP %i to %s', async (responseStatus, expectedCode) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: false, status: responseStatus}));

        await expect(imageGenerationService.generateImageStream('a lighthouse'))
            .rejects.toMatchObject({code: expectedCode});
    });

    it('reports a transport failure as BACKEND_UNAVAILABLE', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

        await expect(imageGenerationService.generateImageStream('a lighthouse'))
            .rejects.toMatchObject({code: BACKEND_UNAVAILABLE});
    });

    it('propagates a caller abort as an AbortError rather than a generation failure', async () => {
        const abortError = new Error('aborted');
        abortError.name = 'AbortError';
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

        const controller = new AbortController();
        controller.abort();

        await expect(imageGenerationService.generateImageStream('a lighthouse', {signal: controller.signal}))
            .rejects.toMatchObject({name: 'AbortError'});
    });

    it('treats an abort the caller did not ask for as a timeout', async () => {
        const abortError = new Error('aborted');
        abortError.name = 'AbortError';
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

        await expect(imageGenerationService.generateImageStream('a lighthouse'))
            .rejects.toMatchObject({code: 'GENERATION_TIMEOUT'});
    });
});

describe('fetchGeneratedImageBlob', () => {
    it('reads through the blob path of the client', async () => {
        const responseBlob = {size: 10};
        apiClient.getBlob.mockResolvedValue(responseBlob);

        const result = await imageGenerationService.fetchGeneratedImageBlob('image-1');

        expect(apiClient.getBlob).toHaveBeenCalledWith('http://api.test/images/image-1');
        expect(result).toBe(responseBlob);
    });
});

describe('normalizeGeneratedImage', () => {
    it('defaults the size to the only size the tool produces', () => {
        const normalized = normalizeGeneratedImage({imageId: 'image-1'});

        expect(normalized.width).toBe(1024);
        expect(normalized.height).toBe(1024);
    });

    it('accepts id as an alias for imageId', () => {
        expect(normalizeGeneratedImage({id: 'image-1'}).imageId).toBe('image-1');
    });

    it('leaves a missing seed null rather than inventing one', () => {
        expect(normalizeGeneratedImage({imageId: 'image-1'}).seed).toBeNull();
    });
});

describe('userFacingMessageForErrorCode', () => {
    it('returns the mapped message for a known code', () => {
        expect(userFacingMessageForErrorCode('GENERATION_TIMEOUT')).toContain('longer than expected');
    });

    it('falls back to the internal message for an unknown code', () => {
        expect(userFacingMessageForErrorCode('WHAT_IS_THIS'))
            .toBe(userFacingMessageForErrorCode(INTERNAL));
    });
});
