import {useCallback, useEffect, useRef, useState} from 'react';
import log from 'loglevel';
import sharedSessionService, {SessionStreamGoneError} from '../service/SharedSessionService.js';
import {TEXT_MESSAGE_START, readSoundCue} from '../service/ChatService.js';
import {EMPTY_TRANSCRIPT, applyFrame, transcriptFromMessages} from '../sharedsessions/sharedSessionTranscript.js';
import {isPageHidden, observePageHidden, observePageResumed} from '../util/pageLifecycle.js';

const RECONNECT_DELAYS_MILLISECONDS = [1000, 2000, 4000, 8000, 16000, 30000];

const BACKGROUND_STREAM_RELEASE_DELAY_MILLISECONDS = 5000;

function useSharedSessionStream({sessionId, viewerUserId, onSoundCue}) {
    const [transcript, setTranscript] = useState(EMPTY_TRANSCRIPT);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [connected, setConnected] = useState(false);

    const cursorRef = useRef(null);
    const controllerRef = useRef(null);
    const generationRef = useRef(0);
    const onSoundCueRef = useRef(onSoundCue);

    useEffect(() => {
        onSoundCueRef.current = onSoundCue;
    }, [onSoundCue]);

    const load = useCallback(async () => {
        const [session, chatMessages] = await Promise.all([
            sharedSessionService.session(sessionId),
            sharedSessionService.messages(sessionId),
        ]);

        setTranscript(transcriptFromMessages(chatMessages, session, viewerUserId));
    }, [sessionId, viewerUserId]);

    const handleFrame = useCallback((frame) => {
        if (frame.id) {
            cursorRef.current = frame.id;
        }

        if (frame.event === TEXT_MESSAGE_START) {
            try {
                const soundCue = readSoundCue(JSON.parse(frame.data)?.metadata);

                if (soundCue) {
                    onSoundCueRef.current?.(soundCue);
                }
            } catch {
                log.debug('[useSharedSessionStream] A start frame carried no readable metadata');
            }
        }

        setTranscript((current) => applyFrame(current, frame, viewerUserId));
    }, [viewerUserId]);

    const follow = useCallback(async (generation) => {
        let attempt = 0;

        while (generation === generationRef.current) {
            const controller = new AbortController();
            controllerRef.current = controller;

            try {
                const frames = sharedSessionService.watch(sessionId, {signal: controller.signal, lastEventId: cursorRef.current});

                for await (const frame of frames) {
                    setConnected(true);
                    attempt = 0;
                    handleFrame(frame);
                }
            } catch (caughtError) {
                if (caughtError?.name === 'AbortError' || generation !== generationRef.current) {
                    return;
                }

                if (caughtError instanceof SessionStreamGoneError) {
                    log.info('[useSharedSessionStream] The stream moved past our cursor; reloading the session');
                    cursorRef.current = null;

                    try {
                        await load();
                    } catch (loadFailure) {
                        log.warn('[useSharedSessionStream] Could not reload the session', loadFailure);
                    }

                    continue;
                }

                log.warn('[useSharedSessionStream] The session stream dropped', caughtError);
            }

            setConnected(false);

            const delay = RECONNECT_DELAYS_MILLISECONDS[Math.min(attempt, RECONNECT_DELAYS_MILLISECONDS.length - 1)];
            attempt += 1;

            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }, [sessionId, handleFrame, load]);

    const disconnect = useCallback(() => {
        generationRef.current += 1;
        controllerRef.current?.abort();
        controllerRef.current = null;
        setConnected(false);
    }, []);

    const connect = useCallback(() => {
        disconnect();
        const generation = generationRef.current;

        void follow(generation);
    }, [disconnect, follow]);

    useEffect(() => {
        if (!sessionId || !viewerUserId) {
            return undefined;
        }

        let cancelled = false;
        cursorRef.current = null;
        setLoading(true);
        setLoadError(null);

        load()
            .then(() => {
                if (!cancelled) {
                    connect();
                }
            })
            .catch((caughtError) => {
                if (!cancelled) {
                    log.error('[useSharedSessionStream] Could not load the session', caughtError);
                    setLoadError(caughtError);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
            disconnect();
        };
    }, [sessionId, viewerUserId, load, connect, disconnect]);

    useEffect(() => {
        if (!sessionId || !viewerUserId) {
            return undefined;
        }

        let releaseTimer = null;

        const stopHidden = observePageHidden(() => {
            releaseTimer = setTimeout(() => {
                if (isPageHidden()) {
                    disconnect();
                }
            }, BACKGROUND_STREAM_RELEASE_DELAY_MILLISECONDS);
        });

        const stopResumed = observePageResumed(() => {
            clearTimeout(releaseTimer);

            if (!controllerRef.current) {
                connect();
            }
        });

        return () => {
            clearTimeout(releaseTimer);
            stopHidden?.();
            stopResumed?.();
        };
    }, [sessionId, viewerUserId, connect, disconnect]);

    return {
        session: transcript.session,
        messages: transcript.messages,
        activeRun: transcript.activeRun,
        loading,
        loadError,
        connected,
    };
}

export default useSharedSessionStream;
