import axiosClient from "../client/AxiosClient.js"
import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";

const atlassianAuthService = {
    authUri: async () => {
        const accessToken = await authService.getAccessToken();
        const uri = `${config.atlassianUri}/auth/uri`;
        const options = axiosClient.setAuthHeader(accessToken);

        return await axiosClient.get(uri, options);
    },
    authCallback: async (code) => {
        const accessToken = await authService.getAccessToken();
        const uri = `${config.atlassianUri}/auth/callback`;
        const queryParams = { code: `${code}` };
        const options = axiosClient.setAuthHeader(accessToken);

        const fullUri = axiosClient.buildUrl(uri, queryParams);
        return await axiosClient.get(fullUri, options);
    }
}

export default atlassianAuthService;
