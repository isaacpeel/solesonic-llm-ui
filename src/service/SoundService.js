import apiClient from '../client/ApiClient.js';
import config from '../properties/ApplicationProperties';

const soundService = {
    fetchSoundBlob: async (soundId) => {
        return await apiClient.getBlob(`${config.soundsUri}/${encodeURIComponent(soundId)}`);
    },
};

export default soundService;
