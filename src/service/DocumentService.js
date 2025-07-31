import axiosClient from "../client/AxiosClient.js"
import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";

const documentService = {
    findTrainingDocuments: async () => {
        const authToken = await authService.getAccessToken();
        const uri = `${config.apiBaseUri}/trainingdocuments`;
        const options = axiosClient.setAuthHeader(authToken);

        return await axiosClient.get(uri, options);
    },
    uploadDocument: async (file) => {
        const authToken = await authService.getAccessToken();
        const uri = `${config.apiBaseUri}/documents/data/upload`;
        const options = {
            ...axiosClient.setAuthHeader(authToken),
            noOp: true
        };

        return await axiosClient.post(uri, file, options);
    }
}

export default documentService;
