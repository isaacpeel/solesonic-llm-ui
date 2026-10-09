import {describe, it, expect, vi} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import useSlashCommandSelection from '../../src/hooks/useSlashCommandSelection.js';
import {isSettingCommand} from '../../src/chat/command/settingCommands.js';

const modelCommand = {
    commandType: 'model',
    command: 'model',
    name: 'model',
    description: 'Choose the model this chat uses for its next messages',
    argument: {name: 'model', description: 'The chat model to use', required: true, optionsPath: '/chats/models'},
};
const summarizeCommand = {commandType: 'prompt', command: 'summarize', name: 'summarize', description: 'Summarize the conversation'};

function renderSelection(overrides = {}) {
    const options = {
        commandCandidates: [modelCommand, summarizeCommand],
        setInputValue: vi.fn(),
        onSettingCommandSelect: vi.fn(),
        ...overrides,
    };

    return {options, ...renderHook(() => useSlashCommandSelection(options))};
}

describe('isSettingCommand', () => {
    it('is true only for the model command type', () => {
        expect(isSettingCommand(modelCommand)).toBe(true);
        expect(isSettingCommand(summarizeCommand)).toBe(false);
        expect(isSettingCommand(null)).toBe(false);
        expect(isSettingCommand(undefined)).toBe(false);
    });
});

describe('useSlashCommandSelection setting commands', () => {
    it('hands a setting command to onSettingCommandSelect and never selects it', () => {
        const {options, result} = renderSelection();

        act(() => {
            result.current.handleCommandSelect(modelCommand);
        });

        expect(options.onSettingCommandSelect).toHaveBeenCalledTimes(1);
        expect(options.onSettingCommandSelect).toHaveBeenCalledWith(modelCommand);
        expect(options.setInputValue).toHaveBeenCalledWith('');
        expect(result.current.selectedCommand).toBeNull();
        expect(result.current.selectedIndex).toBe(-1);
    });

    it('leaves an already selected command alone when a setting command is chosen', () => {
        const {result} = renderSelection();

        act(() => {
            result.current.handleCommandSelect(summarizeCommand);
        });

        act(() => {
            result.current.handleCommandSelect(modelCommand);
        });

        expect(result.current.selectedCommand).toBe(summarizeCommand);
    });

    it('still selects every other command', () => {
        const {options, result} = renderSelection();

        act(() => {
            result.current.handleCommandSelect(summarizeCommand);
        });

        expect(result.current.selectedCommand).toBe(summarizeCommand);
        expect(options.onSettingCommandSelect).not.toHaveBeenCalled();
        expect(options.setInputValue).toHaveBeenCalledWith('');
    });

    it('ignores an empty selection', () => {
        const {options, result} = renderSelection();

        act(() => {
            result.current.handleCommandSelect(null);
        });

        expect(options.onSettingCommandSelect).not.toHaveBeenCalled();
        expect(result.current.selectedCommand).toBeNull();
    });
});
