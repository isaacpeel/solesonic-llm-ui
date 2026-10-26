import soundService from '../service/SoundService.js';
import {createObjectUrlCache} from './createObjectUrlCache.js';

const soundObjectUrlCache = createObjectUrlCache(
    (soundId) => soundService.fetchSoundBlob(soundId)
);

export async function acquireSoundObjectUrl(soundId) {
    return await soundObjectUrlCache.acquire(soundId);
}

export function releaseSoundObjectUrl(soundId) {
    soundObjectUrlCache.release(soundId);
}
