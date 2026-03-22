import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';

vi.mock('../../src/service/SlashCommandService.js', () => ({
    default: {
        fetchCommands: vi.fn(),
    },
}));

import useSlashCommands from '../../src/hooks/useSlashCommands.js';
import slashCommandService from '../../src/service/SlashCommandService.js';

function createHook(initialInputValue = '', providedSetInputValue) {
    const setInputValue = providedSetInputValue || vi.fn();
    let currentInputValue = initialInputValue;

    const {result, rerender} = renderHook(
        ({inputValue}) => useSlashCommands({inputValue, setInputValue}),
        {initialProps: {inputValue: currentInputValue}}
    );

    const setInputAndRerender = (nextInputValue) => {
        currentInputValue = nextInputValue;
        rerender({inputValue: currentInputValue});
    };

    return {result, setInputValue, setInputAndRerender};
}

async function waitForDebounce() {
    act(() => {
        vi.advanceTimersByTime(250);
    });

    await act(async () => {
        await Promise.resolve();
    });
}

describe('useSlashCommands', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        slashCommandService.fetchCommands.mockResolvedValue([]);
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('No suggestion when input does not start with /', () => {
        const {result} = createHook('hello');

        expect(result.current.ghostText).toBe('');
        expect(result.current.suggestion).toBe(null);
    });

    it('Fetches commands when input starts with /', async () => {
        const commandResults = [{command: 'agile', name: 'agile', description: 'desc'}];
        slashCommandService.fetchCommands.mockResolvedValueOnce(commandResults);

        createHook('/ag');
        await waitForDebounce();

        expect(slashCommandService.fetchCommands).toHaveBeenCalledWith('ag');
    });

    it('Ghost text computation', async () => {
        const commandResults = [{command: 'agile', name: 'agile', description: 'desc'}];
        slashCommandService.fetchCommands.mockResolvedValueOnce(commandResults);

        const {result} = createHook('/ag');
        await waitForDebounce();

        expect(result.current.ghostText).toBe('ile');
    });

    it('Tab accept', async () => {
        const commandResults = [{command: 'agile', name: 'agile', description: 'desc'}];
        const setInputValue = vi.fn();
        slashCommandService.fetchCommands.mockResolvedValueOnce(commandResults);

        const {result} = createHook('/ag', setInputValue);
        await waitForDebounce();

        act(() => {
            result.current.handleTabAccept();
        });

        expect(setInputValue).toHaveBeenCalledWith('/agile ');
        expect(result.current.suggestion).toBe(null);
    });

    it('getSelectedCommand returns command', async () => {
        const commandResults = [{command: 'agile', name: 'agile', description: 'desc'}];
        slashCommandService.fetchCommands.mockResolvedValueOnce(commandResults);

        const {result} = createHook('/agile ');
        await waitForDebounce();

        expect(result.current.getSelectedCommand()).toBe(null);
    });

    it('getSelectedCommand returns null', () => {
        const {result} = createHook('hello');

        expect(result.current.getSelectedCommand()).toBe(null);
    });

    it('Exact match', async () => {
        const commandResults = [{command: 'agile', name: 'agile', description: 'desc'}];
        slashCommandService.fetchCommands.mockResolvedValueOnce(commandResults);

        const {result} = createHook('/agile');
        await waitForDebounce();

        expect(result.current.ghostText).toBe('');
        expect(result.current.getSelectedCommand()).toBe('agile');
    });

    it('Debounce', async () => {
        const commandResults = [{command: 'agile', name: 'agile', description: 'desc'}];
        slashCommandService.fetchCommands.mockResolvedValue(commandResults);

        const {setInputAndRerender} = createHook('/a');

        setInputAndRerender('/ag');
        setInputAndRerender('/agi');

        await waitForDebounce();

        expect(slashCommandService.fetchCommands).toHaveBeenCalledTimes(1);
        expect(slashCommandService.fetchCommands).toHaveBeenCalledWith('agi');
    });
});
