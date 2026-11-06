import apiClient, {ApiError} from '../client/ApiClient.js';
import authService from './AuthService.js';
import config from '../properties/ApplicationProperties';

export const OFFER_NOT_FOUND_CODE = 'OFFER_NOT_FOUND';
export const OFFER_ALREADY_DECIDED_CODE = 'OFFER_ALREADY_DECIDED';
export const OFFER_EXPIRED_CODE = 'OFFER_EXPIRED';
export const OFFER_WITHDRAWN_CODE = 'OFFER_WITHDRAWN';
export const AGENT_LIMIT_REACHED_CODE = 'AGENT_LIMIT_REACHED';
export const NOT_PERMITTED_CODE = 'NOT_PERMITTED';
export const AGENT_NOT_FOUND_CODE = 'AGENT_NOT_FOUND';
export const INVALID_AGENT_UPDATE_CODE = 'INVALID_AGENT_UPDATE';
export const RUN_TOO_SOON_CODE = 'RUN_TOO_SOON';

export const OFFER_STATUSES = {
    PENDING: 'PENDING',
    ACCEPTED: 'ACCEPTED',
    DECLINED: 'DECLINED',
    EXPIRED: 'EXPIRED',
    WITHDRAWN: 'WITHDRAWN',
};

export const AGENT_STATUSES = {
    ACTIVE: 'ACTIVE',
    PAUSED: 'PAUSED',
};

export const DEFAULT_CADENCE = 'DAILY';

export const AGENT_CADENCES = [
    {value: 'DAILY', label: 'Daily'},
    {value: 'WEEKLY', label: 'Weekly'},
];

const userUri = async () => `${config.usersUri}/${encodeURIComponent(await authService.getUserId())}`;

const offersUri = async () => `${await userUri()}/interest-offers`;

const offerUri = async (offerId) => `${await offersUri()}/${encodeURIComponent(offerId)}`;

const agentsUri = async () => `${await userUri()}/interest-agents`;

const agentUri = async (agentId) => `${await agentsUri()}/${encodeURIComponent(agentId)}`;

const definedEntries = (changes) => {
    return Object.fromEntries(Object.entries(changes ?? {}).filter(([, value]) => value !== undefined));
};

export const hasApiErrorCode = (caughtError, code) => caughtError instanceof ApiError && caughtError.code === code;

const interestService = {
    getPendingOffers: async () => {
        return await apiClient.get(await offersUri());
    },

    getOffer: async (offerId) => {
        return await apiClient.get(await offerUri(offerId));
    },

    acceptOffer: async (offerId, cadence) => {
        return await apiClient.post(`${await offerUri(offerId)}/accept`, definedEntries({cadence}));
    },

    declineOffer: async (offerId) => {
        return await apiClient.post(`${await offerUri(offerId)}/decline`);
    },

    getAgents: async () => {
        return await apiClient.get(await agentsUri());
    },

    updateAgent: async (agentId, changes) => {
        return await apiClient.patch(await agentUri(agentId), definedEntries(changes));
    },

    deleteAgent: async (agentId) => {
        return await apiClient.delete(await agentUri(agentId));
    },

    runAgent: async (agentId) => {
        return await apiClient.post(`${await agentUri(agentId)}/run`);
    },

    getAgentUpdates: async (agentId, page, size) => {
        const searchParams = new URLSearchParams({page: String(page), size: String(size)});

        return await apiClient.get(`${await agentUri(agentId)}/updates?${searchParams.toString()}`);
    },

    getUpdateForChat: async (chatId) => {
        try {
            return await apiClient.get(`${await userUri()}/interest-updates/by-chat/${encodeURIComponent(chatId)}`);
        } catch (caughtError) {
            if (caughtError instanceof ApiError && caughtError.status === 404) {
                return null;
            }

            throw caughtError;
        }
    },
};

export default interestService;
