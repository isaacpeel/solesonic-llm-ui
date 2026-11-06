import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('../../src/client/ApiClient.js', async (importOriginal) => ({
    ...await importOriginal(),
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getUserId: vi.fn(),
    },
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {
        apiBaseUri: 'https://api.example.com',
        usersUri: 'https://api.example.com/users',
    },
}));

import interestService, {AGENT_CADENCES} from '../../src/service/InterestService.js';
import apiClient, {ApiError} from '../../src/client/ApiClient.js';
import authService from '../../src/service/AuthService.js';

const USER_URI = 'https://api.example.com/users/user-7';

function apiError(status, code) {
    return new ApiError({message: `${status}: ${code}`, status, method: 'GET', uri: USER_URI, code});
}

beforeEach(() => {
    vi.clearAllMocks();
    authService.getUserId.mockResolvedValue('user-7');
    apiClient.get.mockResolvedValue(null);
    apiClient.post.mockResolvedValue(null);
    apiClient.patch.mockResolvedValue(null);
    apiClient.delete.mockResolvedValue(null);
});

describe('InterestService offers', () => {
    it('lists pending offers', async () => {
        apiClient.get.mockResolvedValue([{id: 'offer-1'}]);

        await expect(interestService.getPendingOffers()).resolves.toEqual([{id: 'offer-1'}]);
        expect(apiClient.get).toHaveBeenCalledWith(`${USER_URI}/interest-offers`);
    });

    it('reads one offer', async () => {
        await interestService.getOffer('offer-1');

        expect(apiClient.get).toHaveBeenCalledWith(`${USER_URI}/interest-offers/offer-1`);
    });

    it('accepts an offer with the chosen cadence', async () => {
        apiClient.post.mockResolvedValue({id: 'agent-1'});

        await expect(interestService.acceptOffer('offer-1', 'WEEKLY')).resolves.toEqual({id: 'agent-1'});
        expect(apiClient.post).toHaveBeenCalledWith(`${USER_URI}/interest-offers/offer-1/accept`, {cadence: 'WEEKLY'});
    });

    it('accepts an offer without a cadence by sending an empty body', async () => {
        await interestService.acceptOffer('offer-1');

        expect(apiClient.post.mock.calls[0]).toStrictEqual([`${USER_URI}/interest-offers/offer-1/accept`, {}]);
    });

    it('declines an offer', async () => {
        await interestService.declineOffer('offer-1');

        expect(apiClient.post).toHaveBeenCalledWith(`${USER_URI}/interest-offers/offer-1/decline`);
    });

    it('encodes ids placed in the path', async () => {
        authService.getUserId.mockResolvedValue('user/7');

        await interestService.getOffer('../offer?x=1');

        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/users/user%2F7/interest-offers/..%2Foffer%3Fx%3D1');
    });
});

describe('InterestService agents', () => {
    it('lists agents', async () => {
        await interestService.getAgents();

        expect(apiClient.get).toHaveBeenCalledWith(`${USER_URI}/interest-agents`);
    });

    it('patches only the defined changes', async () => {
        await interestService.updateAgent('agent-1', {label: 'F1', query: undefined, status: 'PAUSED'});

        expect(apiClient.patch.mock.calls[0]).toStrictEqual([`${USER_URI}/interest-agents/agent-1`, {label: 'F1', status: 'PAUSED'}]);
    });

    it('deletes an agent', async () => {
        await interestService.deleteAgent('agent-1');

        expect(apiClient.delete).toHaveBeenCalledWith(`${USER_URI}/interest-agents/agent-1`);
    });

    it('asks for a run', async () => {
        apiClient.post.mockResolvedValue({id: 'agent-1', nextRunAt: '2026-10-21T10:00:00Z'});

        await expect(interestService.runAgent('agent-1')).resolves.toMatchObject({id: 'agent-1'});
        expect(apiClient.post).toHaveBeenCalledWith(`${USER_URI}/interest-agents/agent-1/run`);
    });

    it('pages an agent\'s updates', async () => {
        await interestService.getAgentUpdates('agent-1', 2, 5);

        expect(apiClient.get).toHaveBeenCalledWith(`${USER_URI}/interest-agents/agent-1/updates?page=2&size=5`);
    });

    it('labels both cadences', () => {
        expect(AGENT_CADENCES).toEqual([
            {value: 'DAILY', label: 'Daily'},
            {value: 'WEEKLY', label: 'Weekly'},
        ]);
    });
});

describe('InterestService.getUpdateForChat', () => {
    it('reads the update behind a news chat', async () => {
        apiClient.get.mockResolvedValue({id: 'update-1', chatId: 'chat-1'});

        await expect(interestService.getUpdateForChat('chat-1')).resolves.toEqual({id: 'update-1', chatId: 'chat-1'});
        expect(apiClient.get).toHaveBeenCalledWith(`${USER_URI}/interest-updates/by-chat/chat-1`);
    });

    it('answers null for an ordinary chat', async () => {
        apiClient.get.mockRejectedValue(apiError(404, undefined));

        await expect(interestService.getUpdateForChat('chat-1')).resolves.toBeNull();
    });

    it('rethrows any other failure', async () => {
        apiClient.get.mockRejectedValue(apiError(500, undefined));

        await expect(interestService.getUpdateForChat('chat-1')).rejects.toMatchObject({status: 500});
    });
});
