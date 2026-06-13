import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('../../src/client/ApiClient.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {
        slashCommandsUri: 'https://api.example.com/slash/commands',
    },
}));

import slashCommandService from '../../src/service/SlashCommandService.js';
import apiClient from '../../src/client/ApiClient.js';

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('SlashCommandService', () => {
    it('fetchCommands returns commands array', async () => {
        const commands = [{commands: 'agile', name: 'jira-agile-board-prompt', description: 'desc'}];
        apiClient.get.mockResolvedValueOnce({commands});

        const result = await slashCommandService.fetchCommands('ag');

        expect(result).toEqual(commands);
        expect(apiClient.get).toHaveBeenCalledWith(
            'https://api.example.com/slash/commands?command=ag',
        );
    });

    it('fetchCommands with partial text includes query parameter', async () => {
        apiClient.get.mockResolvedValueOnce({commands: []});

        await slashCommandService.fetchCommands('ag');

        expect(apiClient.get).toHaveBeenCalledWith(
            'https://api.example.com/slash/commands?command=ag',
        );
    });

    it('fetchCommands with no argument omits query parameter', async () => {
        apiClient.get.mockResolvedValueOnce({commands: []});

        await slashCommandService.fetchCommands();

        expect(apiClient.get).toHaveBeenCalledWith(
            'https://api.example.com/slash/commands',
        );
    });

    it('fetchCommands on error returns empty array and logs error', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        apiClient.get.mockRejectedValueOnce(new Error('request failed'));

        const result = await slashCommandService.fetchCommands('ag');

        expect(result).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });
});
