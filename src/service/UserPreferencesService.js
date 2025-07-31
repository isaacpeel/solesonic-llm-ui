import axiosClient from "../client/AxiosClient.js"
import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";

const userPreferencesService = {
    update: async (userPreferences) => {
        const accessToken = await authService.getAccessToken();
        const userId = await authService.getUserId();

        const uri = `${config.usersUri}/${userId}/preferences`;
        const options = axiosClient.setAuthHeader(accessToken);

        return await axiosClient.put(uri, userPreferences, options);
    },
    get: async () => {
        const accessToken = await authService.getAccessToken();
        const userId = await authService.getUserId();

        const uri = `${config.usersUri}/${userId}/preferences`;
        const options = axiosClient.setAuthHeader(accessToken);

        return await axiosClient.get(uri, options);
    },
    save: async (userPreferences) => {
        const accessToken = await authService.getAccessToken();
        const userId = await authService.getUserId();

        const uri = `${config.usersUri}/${userId}/preferences`;
        const options = axiosClient.setAuthHeader(accessToken);

        return await axiosClient.post(uri, userPreferences, options);
    }
}

export default userPreferencesService;
