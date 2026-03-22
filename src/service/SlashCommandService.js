import axiosClient from "../client/AxiosClient.js";
import authService from './AuthService.js';
import config from "../properties/ApplicationProperties";

const slashCommandService = {

    /**
     * Fetches slash command suggestions from the API.
     * @param {string} [command] - Optional partial command text (without the leading "/").
     * @returns {Promise<Array<{command: string, name: string, description: string}>>}
     *          Resolves to the `commands` array from the response, or [] on error.
     */
    fetchCommands: async (command) => {
        const accessToken = await authService.getAccessToken();
        const options = axiosClient.setAuthHeader(accessToken);

        let uri = config.slashCommandsUri;

        if (command) {
            uri = `${uri}?command=${encodeURIComponent(command)}`;
        }

        try {
            const response = await axiosClient.get(uri, options);
            return response?.commands || [];
        } catch (error) {
            console.error('[SlashCommandService] Failed to fetch commands:', error);
            return [];
        }
    },
};

export default slashCommandService;
