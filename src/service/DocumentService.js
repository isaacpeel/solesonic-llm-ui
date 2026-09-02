import apiClient from '../client/ApiClient.js';
import config from "../properties/ApplicationProperties";

const documentService = {
    findIngestedDocuments: async () => {
        return await apiClient.get(`${config.apiBaseUri}/documents/ingested`);
    },
    uploadDocument: async (file) => {
        return await apiClient.post(`${config.apiBaseUri}/documents/data/upload`, file, { noOp: true });
    },
    deleteIngestedDocument: async (id) => {
        return await apiClient.delete(`${config.apiBaseUri}/documents/ingested/${id}`);
    },
    refreshIngestedDocument: async (id) => {
        return await apiClient.post(`${config.apiBaseUri}/documents/ingested/${id}/refresh`);
    },
    processDocumentQueue: async () => {
        return await apiClient.post(`${config.apiBaseUri}/documents/ingested/processQueue`);
    },
};

export default documentService;
