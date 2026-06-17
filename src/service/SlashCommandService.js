import apiClient from '../client/ApiClient.js';
import config from "../properties/ApplicationProperties";

const slashCommandService = {
    fetchCommands: async (command) => {
        const uri = command
            ? `${config.slashCommandsUri}?command=${encodeURIComponent(command)}`
            : config.slashCommandsUri;

        try {
            const response = await apiClient.get(uri);
            return response?.commands || [];
        } catch (error) {
            console.error('[SlashCommandService] Failed to fetch commands:', error);
            return [];
        }
    },
};

export default slashCommandService;
