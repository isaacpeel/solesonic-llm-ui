import {useCallback, useEffect, useRef, useState} from 'react';
import log from 'loglevel';
import imageGenerationService, {
    ImageGenerationError,
    INTERNAL,
    userFacingMessageForErrorCode,
} from '../service/ImageGenerationService.js';

export const IDLE = 'idle';
export const GENERATING = 'generating';
export const COMPLETED = 'completed';
export const FAILED = 'failed';

/*
 * The server sends nothing until it has talked to ComfyUI, so the bar would sit blank for the
 * first beat of a 5–15s wait. Seed a step; the first real frame replaces it.
 */
const SEEDED_PROGRESS_MESSAGE = 'Starting…';

/**
 * Drives one image generation at a time.
 *
 * `progressPercent` is carried but deliberately not presented as precise — the server's
 * 15→85 ramp is a time-based estimate that can stall at 85 on a slow run (§2.5 of the
 * integration plan), so the message text is the honest signal and the bar is decoration.
 */
function useImageGeneration() {
    const [status, setStatus] = useState(IDLE);
    const [progressPercent, setProgressPercent] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [generatedImage, setGeneratedImage] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);

    const controller = useRef(null);
    const lastPrompt = useRef('');

    /*
     * Leaving the page mid-generation must not leave the request running — one GPU serves
     * every user, so an abandoned generation holds a slot nobody is waiting on.
     */
    useEffect(() => {
        return () => controller.current?.abort();
    }, []);

    const cancel = useCallback(() => {
        controller.current?.abort();
        controller.current = null;

        setStatus(IDLE);
        setProgressPercent(0);
        setProgressMessage('');
    }, []);

    const generate = useCallback(async (prompt) => {
        const trimmedPrompt = typeof prompt === 'string' ? prompt.trim() : '';

        if (!trimmedPrompt) {
            return;
        }

        controller.current?.abort();
        controller.current = new AbortController();
        const activeController = controller.current;

        lastPrompt.current = trimmedPrompt;

        setStatus(GENERATING);
        setProgressPercent(0);
        setProgressMessage(SEEDED_PROGRESS_MESSAGE);
        setGeneratedImage(null);
        setErrorMessage(null);

        let sawTerminalFrame = false;

        try {
            await imageGenerationService.generateImageStream(trimmedPrompt, {
                signal: activeController.signal,
                onEvent: (event) => {
                    imageGenerationService.handleGenerationEvent(event, {
                        prompt: trimmedPrompt,
                        onProgress: ({percent, message}) => {
                            /* Server-side clamped to be monotonic, so no smoothing is needed here. */
                            if (typeof percent === 'number') {
                                setProgressPercent(percent);
                            }

                            if (message) {
                                setProgressMessage(message);
                            }
                        },
                        onComplete: (completedImage) => {
                            sawTerminalFrame = true;

                            setGeneratedImage(completedImage);
                            setProgressPercent(100);
                            setStatus(COMPLETED);
                        },
                        onFailure: (generationError) => {
                            sawTerminalFrame = true;

                            setErrorMessage(generationError.message);
                            setStatus(FAILED);
                        },
                    });
                },
            });

            /*
             * The stream ended without `complete` or `error`. Nothing else clears GENERATING,
             * so without this the placeholder spins forever on a dropped connection.
             */
            if (!sawTerminalFrame && !activeController.signal.aborted) {
                setErrorMessage(userFacingMessageForErrorCode(INTERNAL));
                setStatus(FAILED);
            }
        } catch (caughtError) {
            if (caughtError?.name === 'AbortError') {
                log.info('[useImageGeneration] Generation cancelled.');

                return;
            }

            const errorCode = caughtError instanceof ImageGenerationError ? caughtError.code : INTERNAL;

            setErrorMessage(userFacingMessageForErrorCode(errorCode));
            setStatus(FAILED);
        } finally {
            if (controller.current === activeController) {
                controller.current = null;
            }
        }
    }, []);

    /*
     * The seed is server-side random and not caller-tunable, so this deliberately produces a
     * different image from the same prompt rather than reproducing the previous one.
     */
    const regenerate = useCallback(async () => {
        await generate(lastPrompt.current);
    }, [generate]);

    return {
        status,
        progressPercent,
        progressMessage,
        generatedImage,
        errorMessage,
        generate,
        regenerate,
        cancel,
    };
}

export default useImageGeneration;
