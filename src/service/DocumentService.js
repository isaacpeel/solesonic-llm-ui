import apiClient from '../client/ApiClient.js';
import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";

const DEFAULT_PAGE_SIZE = 20;

const collectionUri = async (scope, {chatId} = {}) => {
    if (scope === 'GLOBAL') {
        return `${config.documentsUri}/global`;
    }

    if (scope === 'USER') {
        const userId = await authService.getUserId();
        return `${config.usersUri}/${userId}/documents`;
    }

    if (scope === 'CHAT') {
        return `${config.chatsUri}/${chatId}/documents`;
    }

    throw new Error(`Unknown retrieval scope: ${scope}`);
};

const documentService = {
    findIngestedDocuments: async (scope, identifiers, page = 0, size = DEFAULT_PAGE_SIZE) => {
        const uri = await collectionUri(scope, identifiers);
        return await apiClient.get(`${uri}?page=${page}&size=${size}`);
    },
    uploadDocument: async (formData, scope, identifiers) => {
        const uri = await collectionUri(scope, identifiers);
        return await apiClient.post(uri, formData);
    },
    deleteIngestedDocument: async (id, scope, identifiers) => {
        const uri = await collectionUri(scope, identifiers);
        return await apiClient.delete(`${uri}/${id}`);
    },
    refreshIngestedDocument: async (id, scope, identifiers) => {
        const uri = await collectionUri(scope, identifiers);
        return await apiClient.post(`${uri}/${id}/refresh`);
    },
    processDocumentQueue: async () => {
        return await apiClient.post(`${config.documentsUri}/processQueue`);
    },
};

export default documentService;
