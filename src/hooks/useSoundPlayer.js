import {useCallback, useRef, useState} from 'react';
import {acquireSoundObjectUrl, releaseSoundObjectUrl} from '../util/soundObjectUrlCache.js';
import {readGameSoundsEnabled} from '../util/soundPreferences.js';

const MISSING_SOUND_RETRY_DELAY_MILLISECONDS = 500;

const SILENT_CLIP_SAMPLE_RATE = 8000;
const SILENT_CLIP_SAMPLE_COUNT = 800;

/*
 * Page-lifetime state: a cue already heard stays heard across stream recovery and remounts,
 * and Safari only keeps allowing playback on the element first started inside a user gesture.
 */
const playedCueIds = new Set();
let sharedAudioElement = null;
let soundPlayerUnlocked = false;
let activePlayback = null;
let silentClipDataUri = null;

function getSharedAudioElement() {
    if (!sharedAudioElement && typeof Audio !== 'undefined') {
        sharedAudioElement = new Audio();
    }

    return sharedAudioElement;
}

/* A short 8-bit mono WAV of silence, built here so the unlock needs no asset request. */
function buildSilentClipDataUri() {
    const headerByteCount = 44;
    const clipBytes = new Uint8Array(headerByteCount + SILENT_CLIP_SAMPLE_COUNT);
    const clipView = new DataView(clipBytes.buffer);

    const writeAscii = (byteOffset, text) => {
        for (let charIndex = 0; charIndex < text.length; charIndex += 1) {
            clipBytes[byteOffset + charIndex] = text.charCodeAt(charIndex);
        }
    };

    writeAscii(0, 'RIFF');
    clipView.setUint32(4, 36 + SILENT_CLIP_SAMPLE_COUNT, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    clipView.setUint32(16, 16, true);
    clipView.setUint16(20, 1, true);
    clipView.setUint16(22, 1, true);
    clipView.setUint32(24, SILENT_CLIP_SAMPLE_RATE, true);
    clipView.setUint32(28, SILENT_CLIP_SAMPLE_RATE, true);
    clipView.setUint16(32, 1, true);
    clipView.setUint16(34, 8, true);
    writeAscii(36, 'data');
    clipView.setUint32(40, SILENT_CLIP_SAMPLE_COUNT, true);
    clipBytes.fill(128, headerByteCount);

    let binaryText = '';

    for (const clipByte of clipBytes) {
        binaryText += String.fromCharCode(clipByte);
    }

    return `data:audio/wav;base64,${btoa(binaryText)}`;
}

/*
 * Must run synchronously inside the click or key press that sends a message: the cue lands
 * seconds later, and Safari only lets that play() through on an element started in a gesture.
 */
export function unlockSoundPlayer() {
    if (soundPlayerUnlocked || activePlayback) {
        return;
    }

    const audioElement = getSharedAudioElement();

    if (!audioElement) {
        return;
    }

    soundPlayerUnlocked = true;
    silentClipDataUri ??= buildSilentClipDataUri();
    detachAudioHandlers(audioElement);
    audioElement.src = silentClipDataUri;

    const playResult = audioElement.play();

    playResult?.catch?.((playError) => {
        if (playError?.name !== 'AbortError') {
            soundPlayerUnlocked = false;
        }
    });
}

/* The API can send the cue a moment before the clip it names is stored. */
async function acquireSoundObjectUrlWithRetry(soundId) {
    try {
        return await acquireSoundObjectUrl(soundId);
    } catch (caughtError) {
        if (caughtError?.status !== 404) {
            throw caughtError;
        }

        await new Promise((resolve) => setTimeout(resolve, MISSING_SOUND_RETRY_DELAY_MILLISECONDS));

        return await acquireSoundObjectUrl(soundId);
    }
}

function detachAudioHandlers(audioElement) {
    audioElement.onended = null;
    audioElement.onerror = null;
}

function useSoundPlayer() {
    const [blockedSound, setBlockedSound] = useState(null);
    const soundSurfaceMountedRef = useRef(false);

    const finishPlayback = useCallback((playback) => {
        if (activePlayback !== playback) {
            return;
        }

        activePlayback = null;

        const audioElement = getSharedAudioElement();

        if (audioElement) {
            detachAudioHandlers(audioElement);
        }

        if (playback.acquired) {
            releaseSoundObjectUrl(playback.soundCue.soundId);
        }

        setBlockedSound(null);
    }, []);

    const stopSound = useCallback(() => {
        const playback = activePlayback;

        if (!playback) {
            return;
        }

        const audioElement = getSharedAudioElement();

        if (audioElement) {
            detachAudioHandlers(audioElement);
            audioElement.pause();
        }

        finishPlayback(playback);
    }, [finishPlayback]);

    const playActiveAudio = useCallback(async (playback) => {
        const audioElement = getSharedAudioElement();

        try {
            await audioElement.play();

            if (activePlayback === playback) {
                setBlockedSound(null);
            }
        } catch (playError) {
            if (activePlayback !== playback) {
                return;
            }

            if (playError?.name === 'NotAllowedError') {
                setBlockedSound(playback.soundCue);
                return;
            }

            console.warn('[useSoundPlayer] Could not play sound:', playError);
            finishPlayback(playback);
        }
    }, [finishPlayback]);

    const startPlayback = useCallback(async (soundCue) => {
        stopSound();

        const playback = {soundCue, acquired: false};
        activePlayback = playback;

        let objectUrl;

        try {
            objectUrl = await acquireSoundObjectUrlWithRetry(soundCue.soundId);
        } catch (caughtError) {
            console.warn('[useSoundPlayer] Could not load sound:', caughtError);
            finishPlayback(playback);
            return;
        }

        playback.acquired = true;

        if (activePlayback !== playback) {
            releaseSoundObjectUrl(soundCue.soundId);
            return;
        }

        const audioElement = getSharedAudioElement();

        if (!audioElement) {
            finishPlayback(playback);
            return;
        }

        audioElement.loop = false;
        audioElement.onended = () => finishPlayback(playback);
        audioElement.onerror = () => finishPlayback(playback);
        audioElement.src = objectUrl;

        await playActiveAudio(playback);
    }, [stopSound, finishPlayback, playActiveAudio]);

    const playSound = useCallback((soundCue) => {
        if (!soundCue?.cueId || !soundCue?.soundId) {
            return;
        }

        /* Deduped on the cue, never the clip: the clip hash is the same for every game. */
        if (soundCue.playOnce && playedCueIds.has(soundCue.cueId)) {
            return;
        }

        playedCueIds.add(soundCue.cueId);

        if (!soundSurfaceMountedRef.current || !readGameSoundsEnabled()) {
            return;
        }

        void startPlayback(soundCue);
    }, [startPlayback]);

    const playBlockedSound = useCallback(() => {
        const playback = activePlayback;

        if (!playback) {
            setBlockedSound(null);
            return;
        }

        void playActiveAudio(playback);
    }, [playActiveAudio]);

    const dismissBlockedSound = useCallback(() => {
        if (blockedSound) {
            stopSound();
        }
    }, [blockedSound, stopSound]);

    /* The stream outlives the chat screen; a cue that lands while it is not shown is skipped. */
    const attachSoundSurface = useCallback(() => {
        soundSurfaceMountedRef.current = true;

        return () => {
            soundSurfaceMountedRef.current = false;
            stopSound();
        };
    }, [stopSound]);

    return {
        blockedSound,
        attachSoundSurface,
        playSound,
        stopSound,
        playBlockedSound,
        dismissBlockedSound,
        unlockSoundPlayer,
    };
}

export default useSoundPlayer;
