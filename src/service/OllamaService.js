import apiClient from '../client/ApiClient.js';
import config from "../properties/ApplicationProperties";

const ollamaService = {
    models: async () => apiClient.get(`${config.ollamaUri}/models`),
    getModel: async (id) => apiClient.get(`${config.ollamaUri}/models/${id}`),
    createModel: async (model) => apiClient.post(`${config.ollamaUri}/models`, model),
    updateModel: async (id, model) => apiClient.put(`${config.ollamaUri}/models/${id}`, model),
    installedModels: async () => apiClient.get(`${config.ollamaUri}/installed`),
};

export default ollamaService;
