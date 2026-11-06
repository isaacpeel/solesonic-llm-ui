import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('../../src/util/soundObjectUrlCache.js', () => ({
    acquireSoundObjectUrl: vi.fn(),
    releaseSoundObjectUrl: vi.fn(),
}));

vi.mock('../../src/util/soundPreferences.js', () => ({
    readAgentSoundsEnabled: vi.fn(),
}));

const FIRST_SOUND_ID = 'a'.repeat(64);
const SECOND_SOUND_ID = 'b'.repeat(64);

let createdAudioElements = [];

class FakeAudio {
    constructor() {
        this.src = '';
        this.loop = true;
        this.onended = null;
        this.onerror = null;
        this.play = vi.fn(() => Promise.resolve());
        this.pause = vi.fn();
        createdAudioElements.push(this);
    }
}

function soundCue(overrides = {}) {
    return {
        cueId: 'sound-cue-1',
        soundId: FIRST_SOUND_ID,
        cue: 'theme',
        playOnce: true,
        source: {type: 'url', value: `/sounds/${FIRST_SOUND_ID}`, mimeType: 'audio/mpeg'},
        ...overrides,
    };
}

function namedError(name) {
    return Object.assign(new Error(name), {name});
}

function sharedAudioElement() {
    return createdAudioElements[0];
}

function stubAudioElementWithFirstPlayRejected(errorName) {
    const audioElement = new FakeAudio();
    createdAudioElements = [audioElement];
    audioElement.play.mockRejectedValueOnce(namedError(errorName));

    vi.stubGlobal('Audio', class {
        constructor() {
            return audioElement;
        }
    });

    return audioElement;
}

function renderMountedSoundPlayer() {
    const renderedHook = renderHook(() => useSoundPlayer());
    let detachSoundSurface = null;

    act(() => {
        detachSoundSurface = renderedHook.result.current.attachSoundSurface();
    });

    return {...renderedHook, detachSoundSurface};
}

async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
}

/*
 * The player keeps page-lifetime state at module level (played cue ids, the unlocked element),
 * so every test loads a fresh copy of it.
 */
let renderHook;
let act;
let waitFor;
let useSoundPlayer;
let unlockSoundPlayer;
let acquireSoundObjectUrl;
let releaseSoundObjectUrl;
let readAgentSoundsEnabled;

beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    createdAudioElements = [];
    vi.stubGlobal('Audio', FakeAudio);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    ({renderHook, act, waitFor} = await import('@testing-library/react'));
    ({acquireSoundObjectUrl, releaseSoundObjectUrl} = await import('../../src/util/soundObjectUrlCache.js'));
    ({readAgentSoundsEnabled} = await import('../../src/util/soundPreferences.js'));
    ({default: useSoundPlayer, unlockSoundPlayer} = await import('../../src/hooks/useSoundPlayer.js'));

    acquireSoundObjectUrl.mockResolvedValue('blob:sound-1');
    readAgentSoundsEnabled.mockReturnValue(true);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('useSoundPlayer playSound', () => {
    it('returns before the sound fetch resolves', async () => {
        let resolveAcquire;
        acquireSoundObjectUrl.mockReturnValue(new Promise((resolve) => {
            resolveAcquire = resolve;
        }));
        const {result} = renderMountedSoundPlayer();

        const playResult = result.current.playSound(soundCue());

        expect(playResult).toBeUndefined();
        expect(acquireSoundObjectUrl).toHaveBeenCalledWith(FIRST_SOUND_ID);
        expect(createdAudioElements.every((audioElement) => audioElement.play.mock.calls.length === 0)).toBe(true);

        await act(async () => {
            resolveAcquire('blob:sound-1');
        });

        await waitFor(() => expect(sharedAudioElement().play).toHaveBeenCalledOnce());
        expect(sharedAudioElement().src).toBe('blob:sound-1');
        expect(sharedAudioElement().loop).toBe(false);
    });

    it('plays a cue once even when a replayed frame delivers it again', async () => {
        const {result} = renderMountedSoundPlayer();

        result.current.playSound(soundCue());
        result.current.playSound(soundCue());

        await waitFor(() => expect(sharedAudioElement().play).toHaveBeenCalledOnce());
        expect(acquireSoundObjectUrl).toHaveBeenCalledOnce();
    });

    it('plays a later session whose cue reuses the same clip under a new cue id', async () => {
        const {result} = renderMountedSoundPlayer();

        result.current.playSound(soundCue());
        await waitFor(() => expect(sharedAudioElement().play).toHaveBeenCalledOnce());

        result.current.playSound(soundCue({cueId: 'sound-cue-2'}));
        await waitFor(() => expect(sharedAudioElement().play).toHaveBeenCalledTimes(2));

        expect(acquireSoundObjectUrl).toHaveBeenCalledTimes(2);
        expect(acquireSoundObjectUrl).toHaveBeenLastCalledWith(FIRST_SOUND_ID);
    });

    it('plays nothing while agent sounds are muted', async () => {
        readAgentSoundsEnabled.mockReturnValue(false);
        const {result} = renderMountedSoundPlayer();

        result.current.playSound(soundCue());

        await flushMicrotasks();
        expect(acquireSoundObjectUrl).not.toHaveBeenCalled();
        expect(createdAudioElements).toHaveLength(0);
    });

    it('ignores a cue without a cue id or sound id', () => {
        const {result} = renderMountedSoundPlayer();

        result.current.playSound(soundCue({cueId: undefined}));
        result.current.playSound(soundCue({soundId: undefined}));
        result.current.playSound(null);

        expect(acquireSoundObjectUrl).not.toHaveBeenCalled();
    });

    it('retries once when the clip is not stored yet', async () => {
        acquireSoundObjectUrl
            .mockRejectedValueOnce(Object.assign(new Error('404'), {status: 404}))
            .mockResolvedValueOnce('blob:sound-1');
        const {result} = renderMountedSoundPlayer();

        result.current.playSound(soundCue());

        await waitFor(() => expect(sharedAudioElement()?.play).toHaveBeenCalledOnce(), {timeout: 2000});
        expect(acquireSoundObjectUrl).toHaveBeenCalledTimes(2);
    });

    it('gives up quietly when the clip cannot be loaded', async () => {
        acquireSoundObjectUrl.mockRejectedValue(Object.assign(new Error('500'), {status: 500}));
        const {result} = renderMountedSoundPlayer();

        result.current.playSound(soundCue());

        await waitFor(() => expect(console.warn).toHaveBeenCalled());
        expect(acquireSoundObjectUrl).toHaveBeenCalledOnce();
        expect(result.current.blockedSound).toBeNull();
    });

    it('releases the clip when it finishes playing', async () => {
        const {result} = renderMountedSoundPlayer();

        result.current.playSound(soundCue());
        await waitFor(() => expect(sharedAudioElement().play).toHaveBeenCalledOnce());

        act(() => {
            sharedAudioElement().onended();
        });

        expect(releaseSoundObjectUrl).toHaveBeenCalledOnce();
        expect(releaseSoundObjectUrl).toHaveBeenCalledWith(FIRST_SOUND_ID);
    });

    it('stops the previous sound when a new cue arrives', async () => {
        acquireSoundObjectUrl.mockImplementation(async (soundId) => `blob:${soundId.slice(0, 1)}`);
        const {result} = renderMountedSoundPlayer();

        result.current.playSound(soundCue());
        await waitFor(() => expect(sharedAudioElement().play).toHaveBeenCalledOnce());

        result.current.playSound(soundCue({cueId: 'sound-cue-2', soundId: SECOND_SOUND_ID}));
        await waitFor(() => expect(sharedAudioElement().play).toHaveBeenCalledTimes(2));

        expect(sharedAudioElement().pause).toHaveBeenCalled();
        expect(releaseSoundObjectUrl).toHaveBeenCalledWith(FIRST_SOUND_ID);
        expect(releaseSoundObjectUrl).not.toHaveBeenCalledWith(SECOND_SOUND_ID);
        expect(sharedAudioElement().src).toBe('blob:b');
    });

    it('warns and releases on a playback failure other than a blocked autoplay', async () => {
        stubAudioElementWithFirstPlayRejected('NotSupportedError');
        const {result} = renderMountedSoundPlayer();

        result.current.playSound(soundCue());

        await waitFor(() => expect(releaseSoundObjectUrl).toHaveBeenCalledWith(FIRST_SOUND_ID));
        expect(console.warn).toHaveBeenCalled();
        expect(result.current.blockedSound).toBeNull();
    });
});

describe('useSoundPlayer sound surface', () => {
    it('skips a cue while no chat screen is mounted, leaving nothing to play later', async () => {
        const {result} = renderHook(useSoundPlayer);

        result.current.playSound(soundCue());

        await flushMicrotasks();
        expect(acquireSoundObjectUrl).not.toHaveBeenCalled();
        expect(result.current.blockedSound).toBeNull();

        act(() => {
            result.current.attachSoundSurface();
        });
        result.current.playSound(soundCue());

        await flushMicrotasks();
        expect(acquireSoundObjectUrl).not.toHaveBeenCalled();
    });

    it('stops the sound and skips later cues once the chat screen unmounts', async () => {
        const {result, detachSoundSurface} = renderMountedSoundPlayer();

        result.current.playSound(soundCue());
        await waitFor(() => expect(sharedAudioElement().play).toHaveBeenCalledOnce());

        act(() => {
            detachSoundSurface();
        });

        expect(sharedAudioElement().pause).toHaveBeenCalledOnce();
        expect(releaseSoundObjectUrl).toHaveBeenCalledWith(FIRST_SOUND_ID);

        result.current.playSound(soundCue({cueId: 'sound-cue-2'}));

        await flushMicrotasks();
        expect(acquireSoundObjectUrl).toHaveBeenCalledOnce();
    });

    it('drops a blocked sound when the chat screen unmounts', async () => {
        stubAudioElementWithFirstPlayRejected('NotAllowedError');
        const {result, detachSoundSurface} = renderMountedSoundPlayer();

        result.current.playSound(soundCue());
        await waitFor(() => expect(result.current.blockedSound).not.toBeNull());

        act(() => {
            detachSoundSurface();
        });

        expect(result.current.blockedSound).toBeNull();
        expect(releaseSoundObjectUrl).toHaveBeenCalledWith(FIRST_SOUND_ID);
    });
});

describe('useSoundPlayer blocked autoplay', () => {
    it('exposes the blocked sound instead of throwing', async () => {
        stubAudioElementWithFirstPlayRejected('NotAllowedError');
        const {result} = renderMountedSoundPlayer();
        const blockedCue = soundCue();

        expect(() => result.current.playSound(blockedCue)).not.toThrow();

        await waitFor(() => expect(result.current.blockedSound).toEqual(blockedCue));
        expect(releaseSoundObjectUrl).not.toHaveBeenCalled();
    });

    it('plays the blocked sound on request and clears it', async () => {
        const audioElement = stubAudioElementWithFirstPlayRejected('NotAllowedError');
        const {result} = renderMountedSoundPlayer();

        result.current.playSound(soundCue());
        await waitFor(() => expect(result.current.blockedSound).not.toBeNull());

        await act(async () => {
            result.current.playBlockedSound();
        });

        expect(audioElement.play).toHaveBeenCalledTimes(2);
        expect(result.current.blockedSound).toBeNull();
    });

    it('dismisses the blocked sound and releases its clip', async () => {
        stubAudioElementWithFirstPlayRejected('NotAllowedError');
        const {result} = renderMountedSoundPlayer();

        result.current.playSound(soundCue());
        await waitFor(() => expect(result.current.blockedSound).not.toBeNull());

        act(() => {
            result.current.dismissBlockedSound();
        });

        expect(result.current.blockedSound).toBeNull();
        expect(releaseSoundObjectUrl).toHaveBeenCalledWith(FIRST_SOUND_ID);
    });
});

describe('useSoundPlayer stopSound', () => {
    it('pauses the playing sound and releases its clip', async () => {
        const {result} = renderMountedSoundPlayer();

        result.current.playSound(soundCue());
        await waitFor(() => expect(sharedAudioElement().play).toHaveBeenCalledOnce());

        act(() => {
            result.current.stopSound();
        });

        expect(sharedAudioElement().pause).toHaveBeenCalledOnce();
        expect(releaseSoundObjectUrl).toHaveBeenCalledOnce();
        expect(releaseSoundObjectUrl).toHaveBeenCalledWith(FIRST_SOUND_ID);
    });

    it('releases a clip that finishes loading after the stop, without playing it', async () => {
        let resolveAcquire;
        acquireSoundObjectUrl.mockReturnValue(new Promise((resolve) => {
            resolveAcquire = resolve;
        }));
        const {result} = renderMountedSoundPlayer();

        result.current.playSound(soundCue());

        act(() => {
            result.current.stopSound();
        });

        await act(async () => {
            resolveAcquire('blob:sound-1');
        });

        await waitFor(() => expect(releaseSoundObjectUrl).toHaveBeenCalledWith(FIRST_SOUND_ID));
        expect(createdAudioElements.every((audioElement) => audioElement.play.mock.calls.length === 0)).toBe(true);
    });

    it('does nothing when no sound is playing', () => {
        const {result} = renderMountedSoundPlayer();

        expect(() => result.current.stopSound()).not.toThrow();
        expect(releaseSoundObjectUrl).not.toHaveBeenCalled();
    });
});

describe('unlockSoundPlayer', () => {
    it('plays a silent clip on the shared element synchronously', () => {
        unlockSoundPlayer();

        expect(sharedAudioElement().src.startsWith('data:audio/wav;base64,')).toBe(true);
        expect(sharedAudioElement().play).toHaveBeenCalledOnce();
    });

    it('unlocks only once per page', () => {
        unlockSoundPlayer();
        unlockSoundPlayer();

        expect(createdAudioElements).toHaveLength(1);
        expect(sharedAudioElement().play).toHaveBeenCalledOnce();
    });

    it('reuses the unlocked element for the sound that follows', async () => {
        unlockSoundPlayer();
        const {result} = renderMountedSoundPlayer();

        result.current.playSound(soundCue());

        await waitFor(() => expect(sharedAudioElement().play).toHaveBeenCalledTimes(2));
        expect(createdAudioElements).toHaveLength(1);
        expect(sharedAudioElement().src).toBe('blob:sound-1');
    });

    it('tries again on the next send when the unlock was refused', async () => {
        const audioElement = stubAudioElementWithFirstPlayRejected('NotAllowedError');

        unlockSoundPlayer();
        await flushMicrotasks();
        unlockSoundPlayer();

        expect(audioElement.play).toHaveBeenCalledTimes(2);
    });

    it('stays unlocked when the silent clip is cut short by the sound that follows', async () => {
        const audioElement = stubAudioElementWithFirstPlayRejected('AbortError');

        unlockSoundPlayer();
        await flushMicrotasks();
        unlockSoundPlayer();

        expect(audioElement.play).toHaveBeenCalledOnce();
    });

    it('does not interrupt a sound that is already playing', async () => {
        const audioElement = stubAudioElementWithFirstPlayRejected('NotAllowedError');
        const {result} = renderMountedSoundPlayer();

        unlockSoundPlayer();
        await flushMicrotasks();

        result.current.playSound(soundCue());
        await waitFor(() => expect(audioElement.play).toHaveBeenCalledTimes(2));

        unlockSoundPlayer();

        expect(audioElement.play).toHaveBeenCalledTimes(2);
        expect(audioElement.src).toBe('blob:sound-1');
    });
});
