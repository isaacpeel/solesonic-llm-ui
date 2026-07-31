import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, renderHook, waitFor} from '@testing-library/react';

vi.mock('../../src/service/ImageGenerationService.js', async () => {
    const actualModule = await vi.importActual('../../src/service/ImageGenerationService.js');

    return {
        ...actualModule,
        default: {
            ...actualModule.default,
            generateImageStream: vi.fn(),
        },
    };
});

import useImageGeneration, {COMPLETED, FAILED, GENERATING, IDLE} from '../../src/hooks/useImageGeneration.js';
import imageGenerationService, {ImageGenerationError} from '../../src/service/ImageGenerationService.js';

function respondWith(...sseEvents) {
    imageGenerationService.generateImageStream.mockImplementation(async (prompt, {onEvent}) => {
        for (const sseEvent of sseEvents) {
            onEvent(sseEvent);
        }
    });
}

function progressFrame(percent, message) {
    return {event: 'progress', data: JSON.stringify({percent, message})};
}

function completeFrame(payload) {
    return {event: 'complete', data: JSON.stringify(payload)};
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('useImageGeneration', () => {
    beforeEach(() => {
        respondWith(completeFrame({imageId: 'image-1', seed: 42, elapsedSeconds: 8.2}));
    });

    it('starts idle', () => {
        const {result} = renderHook(() => useImageGeneration());

        expect(result.current.status).toBe(IDLE);
        expect(result.current.generatedImage).toBeNull();
        expect(result.current.errorMessage).toBeNull();
    });

    it('ignores a blank prompt', async () => {
        const {result} = renderHook(() => useImageGeneration());

        await act(async () => {
            await result.current.generate('   ');
        });

        expect(imageGenerationService.generateImageStream).not.toHaveBeenCalled();
        expect(result.current.status).toBe(IDLE);
    });

    it('sends the trimmed prompt', async () => {
        const {result} = renderHook(() => useImageGeneration());

        await act(async () => {
            await result.current.generate('  a lighthouse  ');
        });

        expect(imageGenerationService.generateImageStream.mock.calls[0][0]).toBe('a lighthouse');
    });

    it('completes with the generated image reference', async () => {
        const {result} = renderHook(() => useImageGeneration());

        await act(async () => {
            await result.current.generate('a lighthouse');
        });

        expect(result.current.status).toBe(COMPLETED);
        expect(result.current.generatedImage).toMatchObject({imageId: 'image-1', seed: 42, prompt: 'a lighthouse'});
        expect(result.current.progressPercent).toBe(100);
    });

    it('tracks the latest progress message', async () => {
        respondWith(
            progressFrame(5, 'Sending prompt to ComfyUI'),
            progressFrame(15, 'Queued as 4f1c8e2a'),
            completeFrame({imageId: 'image-1'})
        );

        const {result} = renderHook(() => useImageGeneration());

        await act(async () => {
            await result.current.generate('a lighthouse');
        });

        expect(result.current.progressMessage).toBe('Queued as 4f1c8e2a');
    });

    it('reports a mapped, user-safe message for an error frame', async () => {
        respondWith({event: 'error', data: JSON.stringify({code: 'GENERATION_TIMEOUT', message: 'ComfyUI 4f1c8e2a timed out'})});

        const {result} = renderHook(() => useImageGeneration());

        await act(async () => {
            await result.current.generate('a lighthouse');
        });

        expect(result.current.status).toBe(FAILED);
        expect(result.current.errorMessage).toContain('longer than expected');
        expect(result.current.errorMessage).not.toContain('ComfyUI');
    });

    it('fails rather than spinning forever when the stream ends with no terminal frame', async () => {
        respondWith(progressFrame(50, 'Generating…'));

        const {result} = renderHook(() => useImageGeneration());

        await act(async () => {
            await result.current.generate('a lighthouse');
        });

        expect(result.current.status).toBe(FAILED);
        expect(result.current.errorMessage).toBeTruthy();
    });

    it('maps a thrown ImageGenerationError to its user-facing message', async () => {
        imageGenerationService.generateImageStream.mockRejectedValue(new ImageGenerationError('FORBIDDEN'));

        const {result} = renderHook(() => useImageGeneration());

        await act(async () => {
            await result.current.generate('a lighthouse');
        });

        expect(result.current.status).toBe(FAILED);
        expect(result.current.errorMessage).toContain('do not have access');
    });

    it('leaves no error state behind after a cancel', async () => {
        const abortError = new Error('aborted');
        abortError.name = 'AbortError';
        imageGenerationService.generateImageStream.mockRejectedValue(abortError);

        const {result} = renderHook(() => useImageGeneration());

        await act(async () => {
            await result.current.generate('a lighthouse');
        });

        expect(result.current.status).not.toBe(FAILED);
        expect(result.current.errorMessage).toBeNull();
    });

    it('returns to idle when cancelled mid-flight', async () => {
        let releaseStream;
        imageGenerationService.generateImageStream.mockImplementation(() => new Promise((resolve) => {
            releaseStream = resolve;
        }));

        const {result} = renderHook(() => useImageGeneration());

        act(() => {
            void result.current.generate('a lighthouse');
        });

        await waitFor(() => expect(result.current.status).toBe(GENERATING));

        act(() => {
            result.current.cancel();
        });

        expect(result.current.status).toBe(IDLE);

        await act(async () => {
            releaseStream();
        });
    });

    it('regenerates with the last prompt, producing a new image rather than reproducing one', async () => {
        const {result} = renderHook(() => useImageGeneration());

        await act(async () => {
            await result.current.generate('a lighthouse');
        });

        respondWith(completeFrame({imageId: 'image-2'}));

        await act(async () => {
            await result.current.regenerate();
        });

        expect(imageGenerationService.generateImageStream).toHaveBeenCalledTimes(2);
        expect(imageGenerationService.generateImageStream.mock.calls[1][0]).toBe('a lighthouse');
        expect(result.current.generatedImage.imageId).toBe('image-2');
    });

    it('clears the previous image when a new generation starts', async () => {
        const {result} = renderHook(() => useImageGeneration());

        await act(async () => {
            await result.current.generate('a lighthouse');
        });

        let releaseStream;
        imageGenerationService.generateImageStream.mockImplementation(() => new Promise((resolve) => {
            releaseStream = resolve;
        }));

        act(() => {
            void result.current.generate('a castle');
        });

        await waitFor(() => expect(result.current.status).toBe(GENERATING));

        expect(result.current.generatedImage).toBeNull();

        await act(async () => {
            releaseStream();
        });
    });
});
