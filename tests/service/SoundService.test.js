import {describe, it, expect, vi, afterEach} from 'vitest';

vi.mock('../../src/client/ApiClient.js', () => ({
    default: {
        getBlob: vi.fn(),
    },
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {
        soundsUri: 'https://api.example.com/sounds',
    },
}));

import apiClient from '../../src/client/ApiClient.js';
import soundService from '../../src/service/SoundService.js';

const SOUND_ID = 'a'.repeat(64);

afterEach(() => {
    vi.clearAllMocks();
});

describe('soundService.fetchSoundBlob', () => {
    it('fetches the clip by id through the authenticated client and returns the blob', async () => {
        const soundBlob = new Blob(['sound-bytes'], {type: 'audio/mpeg'});
        apiClient.getBlob.mockResolvedValue(soundBlob);

        await expect(soundService.fetchSoundBlob(SOUND_ID)).resolves.toBe(soundBlob);

        expect(apiClient.getBlob).toHaveBeenCalledWith(`https://api.example.com/sounds/${SOUND_ID}`);
    });

    it('propagates a failed fetch so the caller can retry a 404', async () => {
        apiClient.getBlob.mockRejectedValue(Object.assign(new Error('404'), {status: 404}));

        await expect(soundService.fetchSoundBlob(SOUND_ID)).rejects.toMatchObject({status: 404});
    });
});
