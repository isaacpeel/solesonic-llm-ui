import apiClient from '../client/ApiClient.js';
import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";

const DEFAULT_PAGE_SIZE = 20;

const CHAT_DOCUMENTS_URI = `${config.chatsUri}/documents`;

const collectionUri = async (scope) => {
    if (scope === 'GLOBAL') {
        return `${config.documentsUri}/global`;
    }

    if (scope === 'USER') {
        const userId = await authService.getUserId();
        return `${config.usersUri}/${userId}/documents`;
    }

    if (scope === 'CHAT') {
        return CHAT_DOCUMENTS_URI;
    }

    throw new Error(`Unknown retrieval scope: ${scope}`);
};

const documentService = {
    // A chat document is retrievable by the chat but owned by whoever uploaded it, so chatId is
    // a query filter on list/upload only — it is not part of the collection root, and delete,
    // refresh, and promote never take it at all.
    findIngestedDocuments: async (scope, {chatId} = {}, page = 0, size = DEFAULT_PAGE_SIZE) => {
        const uri = await collectionUri(scope);
        const chatFilter = scope === 'CHAT' && chatId ? `&chatId=${chatId}` : '';
        return await apiClient.get(`${uri}?page=${page}&size=${size}${chatFilter}`);
    },
    uploadDocument: async (formData, scope, {chatId} = {}) => {
        const uri = await collectionUri(scope);
        const chatQuery = scope === 'CHAT' && chatId ? `?chatId=${chatId}` : '';
        return await apiClient.post(`${uri}${chatQuery}`, formData);
    },
    deleteIngestedDocument: async (id, scope) => {
        const uri = await collectionUri(scope);
        return await apiClient.delete(`${uri}/${id}`);
    },
    refreshIngestedDocument: async (id, scope) => {
        const uri = await collectionUri(scope);
        return await apiClient.post(`${uri}/${id}/refresh`);
    },
    // Moves a document into a wider audience in place, without re-embedding. Reachable from the
    // CHAT collection (promote to the caller's own documents, or to global) and the USER
    // collection (promote to global), so it resolves its root through collectionUri like every
    // other scoped operation.
    promoteDocument: async (id, scope, target) => {
        const uri = await collectionUri(scope);
        return await apiClient.post(`${uri}/${id}/promote/${target}`);
    },
    processDocumentQueue: async () => {
        return await apiClient.post(`${config.documentsUri}/processQueue`);
    },
};

export default documentService;
