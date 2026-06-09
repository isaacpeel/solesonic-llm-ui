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

    it('clears commandCandidates when input does not start with /', () => {
        const {result} = createHook('hello');

        expect(result.current.commandCandidates).toEqual([]);
    });

    it('Fetches commands when input starts with /', async () => {
        const commandResults = [{commands: 'agile', name: 'agile', description: 'desc'}];
        slashCommandService.fetchCommands.mockResolvedValueOnce(commandResults);

        createHook('/ag');
        await waitForDebounce();

        expect(slashCommandService.fetchCommands).toHaveBeenCalledWith('ag');
    });

    it('Debounce', async () => {
        const commandResults = [{commands: 'agile', name: 'agile', description: 'desc'}];
        slashCommandService.fetchCommands.mockResolvedValue(commandResults);

        const {setInputAndRerender} = createHook('/a');

        setInputAndRerender('/ag');
        setInputAndRerender('/agi');

        await waitForDebounce();

        expect(slashCommandService.fetchCommands).toHaveBeenCalledTimes(1);
        expect(slashCommandService.fetchCommands).toHaveBeenCalledWith('agi');
    });
});
