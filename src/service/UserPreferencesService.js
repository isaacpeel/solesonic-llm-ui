import apiClient from '../client/ApiClient.js';
import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";

const userPreferencesService = {
    update: async (userPreferences) => {
        const userId = await authService.getUserId();
        return await apiClient.put(`${config.usersUri}/${userId}/preferences`, userPreferences);
    },
    patch: async (partialPreferences) => {
        const userId = await authService.getUserId();
        return await apiClient.patch(`${config.usersUri}/${userId}/preferences`, partialPreferences);
    },
    get: async () => {
        const userId = await authService.getUserId();
        return await apiClient.get(`${config.usersUri}/${userId}/preferences`);
    },
    save: async (userPreferences) => {
        const userId = await authService.getUserId();
        return await apiClient.post(`${config.usersUri}/${userId}/preferences`, userPreferences);
    },
};

export default userPreferencesService;
