import apiClient from '../client/ApiClient.js';
import config from "../properties/ApplicationProperties";

const documentService = {
    findTrainingDocuments: async () => {
        return await apiClient.get(`${config.apiBaseUri}/trainingdocuments`);
    },
    uploadDocument: async (file) => {
        return await apiClient.post(`${config.apiBaseUri}/documents/data/upload`, file, { noOp: true });
    },
};

export default documentService;
