import apiClient, { buildUrl } from '../client/ApiClient.js';
import config from "../properties/ApplicationProperties";

const googleAuthService = {
    authUri: async () => apiClient.get(`${config.googleUri}/auth/uri`),
    authCallback: async (code) => {
        const uri = buildUrl(`${config.googleUri}/auth/callback`, { code: `${code}` });

        return await apiClient.get(uri);
    },
    profile: async () => apiClient.get(`${config.googleUri}/auth/profile`),
    revoke: async () => apiClient.post(`${config.googleUri}/auth/revoke`),
};

export default googleAuthService;
