import apiClient from '../client/ApiClient.js';
import config from "../properties/ApplicationProperties";

export const INVALID_LLM_KEY_CODE = 'INVALID_LLM_KEY';
export const LLM_KEY_VALIDATION_UNAVAILABLE_CODE = 'LLM_KEY_VALIDATION_UNAVAILABLE';
export const LLM_KEY_MISSING_CODE = 'LLM_KEY_MISSING';
export const LLM_KEY_PAGE_SIZE = 50;
export const NO_MODEL_ACCESS_MESSAGE = "Model access isn't configured for your account. Ask an administrator.";

function llmKeyUri(userId) {
    return `${config.llmKeysUri}/${encodeURIComponent(userId)}`;
}

const llmKeyService = {
    findKeys: async (page = 0, size = LLM_KEY_PAGE_SIZE) => {
        return await apiClient.get(`${config.llmKeysUri}?page=${page}&size=${size}`);
    },

    findKey: async (userId) => {
        return await apiClient.get(llmKeyUri(userId));
    },

    registerKey: async (userId, apiKey) => {
        return await apiClient.put(llmKeyUri(userId), {apiKey});
    },

    removeKey: async (userId) => {
        return await apiClient.delete(llmKeyUri(userId));
    },
};

export default llmKeyService;
