import apiClient from '../client/ApiClient.js';
import config from "../properties/ApplicationProperties";

export const UNKNOWN_MODEL_CODE = 'UNKNOWN_MODEL';
export const MODEL_LIST_UNAVAILABLE_CODE = 'MODEL_LIST_UNAVAILABLE';

function chatModelUri(chatId) {
    return `${config.chatsUri}/${encodeURIComponent(chatId)}/model`;
}

const chatModelService = {
    options: async (chatId) => {
        const uri = chatId
            ? `${config.chatModelsUri}?${new URLSearchParams({chatId}).toString()}`
            : config.chatModelsUri;

        return await apiClient.get(uri);
    },

    select: async (chatId, model) => {
        return await apiClient.put(chatModelUri(chatId), {model});
    },

    reset: async (chatId) => {
        return await apiClient.delete(chatModelUri(chatId));
    },
};

export default chatModelService;
