import apiClient from '../client/ApiClient.js';
import config from "../properties/ApplicationProperties";

const documentService = {
    findTrainingDocuments: async () => {
        return await apiClient.get(`${config.apiBaseUri}/trainingdocuments`);
    },
    uploadDocument: async (file) => {
        return await apiClient.post(`${config.apiBaseUri}/documents/data/upload`, file, { noOp: true });
    },
    deleteTrainingDocument: async (id) => {
        return await apiClient.delete(`${config.apiBaseUri}/trainingdocuments/${id}`);
    },
    refreshTrainingDocument: async (id) => {
        return await apiClient.post(`${config.apiBaseUri}/trainingdocuments/${id}/refresh`);
    },
    processDocumentQueue: async () => {
        return await apiClient.post(`${config.apiBaseUri}/trainingdocuments/processQueue`);
    },
};

export default documentService;
