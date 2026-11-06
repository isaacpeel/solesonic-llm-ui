import apiClient, {buildUrl} from '../client/ApiClient.js';
import config from '../properties/ApplicationProperties.jsx';

export const DIRECTORY_PAGE_SIZE = 20;

const userDirectoryService = {
    search: async (query = '', {limit = DIRECTORY_PAGE_SIZE, signal} = {}) => {
        const uri = buildUrl(config.userDirectoryUri, {q: query, limit});
        const options = signal ? {signal} : undefined;

        return await apiClient.get(uri, options) ?? [];
    },
};

export default userDirectoryService;
