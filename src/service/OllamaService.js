import axiosClient from "../client/AxiosClient.js"
import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";

const ollamaService = {
    models: async () => {
        const accessToken = await authService.getAccessToken();
        const uri = `${config.ollamaUri}/models`;
        const options = axiosClient.setAuthHeader(accessToken);

        return await axiosClient.get(uri, options);
    },

    getModel: async (id) => {
        const accessToken = await authService.getAccessToken();
        const uri = `${config.ollamaUri}/models/${id}`;
        const options = axiosClient.setAuthHeader(accessToken);

        return await axiosClient.get(uri, options);
    },

    createModel: async (model) => {
        const accessToken = await authService.getAccessToken();
        const uri = `${config.ollamaUri}/models`;
        const options = axiosClient.setAuthHeader(accessToken);

        console.log('OllamaService.createModel called with:', model);

        return await axiosClient.post(uri, model, options);
    },

    updateModel: async (id, model) => {
        const accessToken = await authService.getAccessToken();
        const uri = `${config.ollamaUri}/models/${id}`;
        const options = axiosClient.setAuthHeader(accessToken);

        return await axiosClient.put(uri, model, options);
    },

    installedModels: async () => {
        const accessToken = await authService.getAccessToken();
        const uri = `${config.ollamaUri}/installed`;
        const options = axiosClient.setAuthHeader(accessToken);

        return await axiosClient.get(uri, options);
    }
}

export default ollamaService;
