import apiClient from '../client/ApiClient.js';
import authService from './AuthService.js';
import config from '../properties/ApplicationProperties';

export const MEMORY_PAGE_SIZE = 50;

const userMemoriesUri = async (userId) => {
    const ownerId = userId ?? await authService.getUserId();
    return `${config.usersUri}/${encodeURIComponent(ownerId)}/memories`;
};

const memoryUri = async (memoryId, userId) => `${await userMemoriesUri(userId)}/${encodeURIComponent(memoryId)}`;

const appendAll = (searchParams, name, values) => {
    (values ?? []).forEach((value) => searchParams.append(name, value));
};

const pagedQueryString = ({userId, statuses, kinds, sorts}, page, size) => {
    const searchParams = new URLSearchParams({page: String(page), size: String(size)});

    if (userId) {
        searchParams.append('userId', userId);
    }

    appendAll(searchParams, 'status', statuses);
    appendAll(searchParams, 'kind', kinds);
    appendAll(searchParams, 'sort', sorts);

    return searchParams.toString();
};

const definedEntries = (changes) => {
    return Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
};

const memoryService = {
    findMemories: async ({statuses, kinds, sorts} = {}, page = 0, size = MEMORY_PAGE_SIZE, userId = null) => {
        const queryString = pagedQueryString({statuses, kinds, sorts}, page, size);
        return await apiClient.get(`${await userMemoriesUri(userId)}?${queryString}`);
    },

    createMemory: async ({kind, content}, userId = null) => {
        return await apiClient.post(await userMemoriesUri(userId), {kind, content});
    },

    updateMemory: async (memoryId, changes, userId = null) => {
        return await apiClient.patch(await memoryUri(memoryId, userId), definedEntries(changes));
    },

    deleteMemory: async (memoryId, userId = null) => {
        return await apiClient.delete(await memoryUri(memoryId, userId));
    },

    deleteAllMemories: async (userId = null) => {
        return await apiClient.delete(await userMemoriesUri(userId));
    },

    findAllMemories: async (filters = {}, page = 0, size = MEMORY_PAGE_SIZE) => {
        return await apiClient.get(`${config.memoriesUri}?${pagedQueryString(filters, page, size)}`);
    },

    findReflections: async ({userId, statuses, sorts} = {}, page = 0, size = MEMORY_PAGE_SIZE) => {
        const queryString = pagedQueryString({userId, statuses, sorts}, page, size);
        return await apiClient.get(`${config.memoriesUri}/reflections?${queryString}`);
    },

    getProcessingStatus: async () => {
        return await apiClient.get(`${config.memoriesUri}/status`);
    },
};

export default memoryService;
