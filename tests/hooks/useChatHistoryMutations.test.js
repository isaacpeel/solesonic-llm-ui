import {describe, it, expect, vi} from 'vitest';
import {renderHook} from '@testing-library/react';
import useChatHistoryMutations from '../../src/hooks/useChatHistoryMutations.js';
import {AI, ERROR, USER} from '../../src/chat/message/ChatMessage.jsx';

function renderMutations() {
    const setChatHistory = vi.fn();
    const {result} = renderHook(() => useChatHistoryMutations({
        setChatHistory,
        setChatId: vi.fn(),
        adoptedChatIdRef: {current: null},
    }));

    const applyLastUpdate = (previousHistory) => {
        const historyUpdater = setChatHistory.mock.calls.at(-1)[0];

        return historyUpdater(previousHistory);
    };

    return {mutations: result.current, setChatHistory, applyLastUpdate};
}

describe('mergeMetadataIntoLastAIMessage', () => {
    it('merges metadata onto the streaming AI message, last write winning per key', () => {
        const {mutations, applyLastUpdate} = renderMutations();
        const previousHistory = [
            {type: USER, text: 'start a game', _key: 'user-1'},
            {type: AI, text: '', _key: 'ai-1', metadata: {kept: 'value', replaced: 'old'}},
        ];

        mutations.mergeMetadataIntoLastAIMessage({replaced: 'new', added: true});
        const nextHistory = applyLastUpdate(previousHistory);

        expect(nextHistory[1].metadata).toEqual({kept: 'value', replaced: 'new', added: true});
        expect(nextHistory[0]).toBe(previousHistory[0]);
    });

    it('starts the metadata when the message has none', () => {
        const {mutations, applyLastUpdate} = renderMutations();

        mutations.mergeMetadataIntoLastAIMessage({added: true});
        const nextHistory = applyLastUpdate([{type: AI, text: '', _key: 'ai-1'}]);

        expect(nextHistory[0].metadata).toEqual({added: true});
    });

    it('leaves history alone when the last entry is not an AI message', () => {
        const {mutations, applyLastUpdate} = renderMutations();
        const previousHistory = [{type: USER, text: 'hello', _key: 'user-1'}];

        mutations.mergeMetadataIntoLastAIMessage({added: true});

        expect(applyLastUpdate(previousHistory)).toBe(previousHistory);
    });

    it('ignores metadata that is not an object', () => {
        const {mutations, setChatHistory} = renderMutations();

        mutations.mergeMetadataIntoLastAIMessage(null);
        mutations.mergeMetadataIntoLastAIMessage('text');
        mutations.mergeMetadataIntoLastAIMessage(['list']);

        expect(setChatHistory).not.toHaveBeenCalled();
    });
});

describe('appendErrorMessage', () => {
    const failure = 'An unexpected error occurred. Please try again.';

    it('adds an error with its details and the failed turn\'s commands', () => {
        const {mutations, applyLastUpdate} = renderMutations();
        mutations.appendErrorMessage(failure, {code: 'internal', occurredAt: '2026-11-05T17:27:20.138Z', analyzable: true});

        const history = applyLastUpdate([{type: USER, text: 'q', commands: ['agile']}, {type: AI, text: ''}]);

        expect(history.at(-1)).toMatchObject({
            type: ERROR, text: failure, code: 'internal', occurredAt: '2026-11-05T17:27:20.138Z',
            analyzable: true, failedCommands: ['agile'],
        });
    });

    it('merges the RUN_ERROR that repeats a failure frame into one error', () => {
        const {mutations, applyLastUpdate} = renderMutations();
        mutations.appendErrorMessage(failure, {code: 'internal', occurredAt: '2026-11-05T17:27:20.138Z', analyzable: true});
        const afterFailureFrame = applyLastUpdate([{type: USER, text: 'q'}]);

        mutations.appendErrorMessage(failure, {code: 'internal', occurredAt: undefined, analyzable: true});
        const afterRunError = applyLastUpdate(afterFailureFrame);

        expect(afterRunError).toHaveLength(2);
        expect(afterRunError[1]).toMatchObject({occurredAt: '2026-11-05T17:27:20.138Z', analyzable: true});
    });

    it('a different error is its own message, and errors without details are not analyzable', () => {
        const {mutations, applyLastUpdate} = renderMutations();
        mutations.appendErrorMessage('first');
        const once = applyLastUpdate([]);
        mutations.appendErrorMessage('second');

        const history = applyLastUpdate(once);

        expect(history.map((message) => message.text)).toEqual(['first', 'second']);
        expect(history.every((message) => message.analyzable === false)).toBe(true);
    });
});
