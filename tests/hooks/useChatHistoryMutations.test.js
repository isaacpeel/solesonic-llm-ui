import {describe, it, expect, vi} from 'vitest';
import {renderHook} from '@testing-library/react';
import useChatHistoryMutations from '../../src/hooks/useChatHistoryMutations.js';
import {AI, USER} from '../../src/chat/message/ChatMessage.jsx';

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
