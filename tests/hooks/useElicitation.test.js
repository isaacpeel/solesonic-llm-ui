import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import useElicitation from '../../src/hooks/useElicitation.js';
import {AI} from '../../src/chat/ChatMessage.jsx';

vi.mock('../../src/service/AuthService.js', () => ({
    default: {},
}));

vi.mock('../../src/service/ElicitationService.js', () => ({
    default: {
        handleElicitationChange: vi.fn(),
        handleElicitationSubmit: vi.fn().mockResolvedValue(undefined),
    },
}));

import elicitationService from '../../src/service/ElicitationService.js';

describe('useElicitation', () => {
    let options;

    beforeEach(() => {
        options = {
            chatHistory: [],
            setChatHistory: vi.fn(),
            handleStreamChunk: vi.fn(),
            activeElicitation: null,
            setActiveElicitation: vi.fn(),
            elicitationValues: {},
            setElicitationValues: vi.fn(),
            elicitationSubmitting: false,
            setElicitationSubmitting: vi.fn(),
            setError: vi.fn(),
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('initial state', () => {
        const {result} = renderHook(() => useElicitation(options));

        expect(result.current.activeElicitation).toBe(null);
        expect(result.current.elicitationValues).toEqual({});
        expect(result.current.elicitationSubmitting).toBe(false);
    });

    it('remove trailing empty AI placeholder', () => {
        options.activeElicitation = {name: 'elicitation'};
        renderHook(() => useElicitation(options));

        const updater = options.setChatHistory.mock.calls[0][0];
        const updatedHistory = updater([
            {type: AI, text: '', _key: 'ai-1'},
        ]);

        expect(updatedHistory).toEqual([]);
    });

    it('no removal when last message has text', () => {
        options.activeElicitation = {name: 'elicitation'};
        renderHook(() => useElicitation(options));

        const updater = options.setChatHistory.mock.calls[0][0];
        const originalHistory = [{type: AI, text: 'hello', _key: 'ai-1'}];
        const updatedHistory = updater(originalHistory);

        expect(updatedHistory).toEqual(originalHistory);
    });

    it('handleElicitationChange', () => {
        const {result} = renderHook(() => useElicitation(options));

        act(() => {
            result.current.handleElicitationChange('fieldOne', 'valueOne');
        });

        expect(elicitationService.handleElicitationChange).toHaveBeenCalledWith('fieldOne', 'valueOne', options.setElicitationValues);
    });

    it('handleElicitationSubmit', async () => {
        options.activeElicitation = {name: 'elicitation'};
        options.elicitationValues = {fieldOne: 'valueOne'};

        const {result} = renderHook(() => useElicitation(options));

        await act(async () => {
            await result.current.handleElicitationSubmit({fieldTwo: 'valueTwo'});
        });

        expect(elicitationService.handleElicitationSubmit).toHaveBeenCalledWith({
            overrideFields: {fieldTwo: 'valueTwo'},
            activeElicitation: options.activeElicitation,
            elicitationValues: options.elicitationValues,
            chatHistory: options.chatHistory,
            setChatHistory: options.setChatHistory,
            setActiveElicitation: options.setActiveElicitation,
            setElicitationSubmitting: options.setElicitationSubmitting,
            setError: options.setError,
            handleStreamChunk: options.handleStreamChunk,
        });
    });
});
