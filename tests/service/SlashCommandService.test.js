import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('../../src/client/AxiosClient.js', () => ({
    default: {
        get: vi.fn(),
        setAuthHeader: vi.fn(),
    },
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getAccessToken: vi.fn(),
    },
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {
        slashCommandsUri: 'https://api.example.com/slash/commands',
    },
}));

import slashCommandService from '../../src/service/SlashCommandService.js';
import axiosClient from '../../src/client/AxiosClient.js';
import authService from '../../src/service/AuthService.js';

describe('SlashCommandService', () => {
    beforeEach(() => {
        authService.getAccessToken.mockResolvedValue('mock-token');
        axiosClient.setAuthHeader.mockReturnValue({headers: {Authorization: 'Bearer mock-token'}});
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('fetchCommands returns commands array', async () => {
        const commands = [{command: 'agile', name: 'jira-agile-board-prompt', description: 'desc'}];
        axiosClient.get.mockResolvedValueOnce({commands});

        const result = await slashCommandService.fetchCommands('ag');

        expect(result).toEqual(commands);
        expect(axiosClient.get).toHaveBeenCalledWith(
            'https://api.example.com/slash/commands?command=ag',
            {headers: {Authorization: 'Bearer mock-token'}}
        );
    });

    it('fetchCommands with partial text includes query parameter', async () => {
        axiosClient.get.mockResolvedValueOnce({commands: []});

        await slashCommandService.fetchCommands('ag');

        expect(axiosClient.get).toHaveBeenCalledWith(
            'https://api.example.com/slash/commands?command=ag',
            {headers: {Authorization: 'Bearer mock-token'}}
        );
    });

    it('fetchCommands with no argument omits query parameter', async () => {
        axiosClient.get.mockResolvedValueOnce({commands: []});

        await slashCommandService.fetchCommands();

        expect(axiosClient.get).toHaveBeenCalledWith(
            'https://api.example.com/slash/commands',
            {headers: {Authorization: 'Bearer mock-token'}}
        );
    });

    it('fetchCommands on error returns empty array and logs error', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        axiosClient.get.mockRejectedValueOnce(new Error('request failed'));

        const result = await slashCommandService.fetchCommands('ag');

        expect(result).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });
});
