import apiClient, { buildUrl } from '../client/ApiClient.js';
import config from "../properties/ApplicationProperties";

const atlassianAuthService = {
    authUri: async () => apiClient.get(`${config.atlassianUri}/auth/uri`),
    authCallback: async (code) => {
        const uri = buildUrl(`${config.atlassianUri}/auth/callback`, { code: `${code}` });
        return await apiClient.get(uri);
    },
};

export default atlassianAuthService;
