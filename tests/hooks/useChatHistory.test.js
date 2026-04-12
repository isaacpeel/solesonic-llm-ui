import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, waitFor} from '@testing-library/react';
import useChatHistory from '../../src/hooks/useChatHistory.js';

vi.mock('../../src/service/AuthService.js', () => ({
    default: {},
}));

vi.mock('../../src/service/ChatService.js', () => ({
    default: {
        findChatDetails: vi.fn(),
    },
}));

vi.mock('../../src/context/useSharedData.jsx', () => ({
    useSharedData: vi.fn(),
}));

import chatService from '../../src/service/ChatService.js';
import {useSharedData} from '../../src/context/useSharedData.jsx';
import {AI} from '../../src/chat/ChatMessage.jsx';

describe('useChatHistory', () => {
    let sharedState;

    beforeEach(() => {
        sharedState = {
            chatId: null,
            setChatId: vi.fn(),
            chatHistory: [{type: AI, text: 'existing', _key: 'existing'}],
            setChatHistory: vi.fn(),
        };
        useSharedData.mockReturnValue(sharedState);
        chatService.findChatDetails.mockResolvedValue({chatMessages: []});
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('welcome message', () => {
        sharedState.chatHistory = [];

        renderHook(() => useChatHistory());

        expect(sharedState.setChatHistory).toHaveBeenCalledTimes(1);
        const welcomeMessages = sharedState.setChatHistory.mock.calls[0][0];
        expect(welcomeMessages).toHaveLength(1);
        expect(welcomeMessages[0]).toMatchObject({
            type: AI,
            text: 'Hi! How can I assist you today?',
            ephemeral: true,
        });
    });

    it('fetch on chatId', async () => {
        sharedState.chatId = 'chat-1';
        chatService.findChatDetails.mockResolvedValue({
            chatMessages: [
                {id: 'msg-1', messageType: AI, message: 'hello', model: 'model-1'},
            ],
        });

        renderHook(() => useChatHistory());

        await waitFor(() => {
            expect(chatService.findChatDetails).toHaveBeenCalledWith('chat-1');
        });

        await waitFor(() => {
            expect(sharedState.setChatHistory).toHaveBeenCalledTimes(1);
            const setHistoryUpdater = sharedState.setChatHistory.mock.calls[0][0];
            const mergedHistory = setHistoryUpdater([]);
            expect(mergedHistory).toEqual([
                {type: AI, text: 'hello', model: 'model-1', _key: 'msg-1'},
            ]);
        });
    });

    it('preserves local AI notifications when chat hydration runs', async () => {
        sharedState.chatId = 'chat-1';
        sharedState.chatHistory = [
            {type: 'USER', text: 'question', _key: 'user-1'},
            {type: AI, text: 'answer', _key: 'ai-local', notifications: ['Jira workflow started']},
        ];

        chatService.findChatDetails.mockResolvedValue({
            chatMessages: [
                {id: 'msg-1', messageType: 'USER', message: 'question'},
                {id: 'msg-2', messageType: AI, message: 'answer', model: 'model-1'},
            ],
        });

        renderHook(() => useChatHistory());

        await waitFor(() => {
            expect(sharedState.setChatHistory).toHaveBeenCalledTimes(1);
        });

        const setHistoryUpdater = sharedState.setChatHistory.mock.calls[0][0];
        const mergedHistory = setHistoryUpdater(sharedState.chatHistory);

        expect(mergedHistory).toEqual([
            {type: 'USER', text: 'question', model: undefined, _key: 'msg-1'},
            {
                type: AI,
                text: 'answer',
                model: 'model-1',
                _key: 'msg-2',
                notifications: ['Jira workflow started'],
            },
        ]);
    });

    it('appendToLastAIMessage', () => {
        renderHook(() => useChatHistory());
        const {result} = renderHook(() => useChatHistory());

        result.current.appendToLastAIMessage(' world');

        const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
        const updatedHistory = updater([{type: AI, text: 'hello', _key: 'ai-1'}]);
        expect(updatedHistory[0].text).toBe('hello world');
    });

    it('appendToLastAIMessage on empty history', () => {
        const {result} = renderHook(() => useChatHistory());

        result.current.appendToLastAIMessage(' world');

        const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
        const emptyHistory = [];
        const updatedHistory = updater(emptyHistory);
        expect(updatedHistory).toBe(emptyHistory);
    });

    it('finalizeLastAIMessage', () => {
        const {result} = renderHook(() => useChatHistory());

        result.current.finalizeLastAIMessage({
            message: {
                message: 'line1\r\n\r\n\r\nline2',
                model: 'gpt-4',
            },
        });

        const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
        const updatedHistory = updater([{type: AI, text: 'old', model: 'old-model', _key: 'ai-1'}]);
        expect(updatedHistory[0].text).toBe('line1\n\nline2');
        expect(updatedHistory[0].model).toBe('gpt-4');
        expect(updatedHistory[0].isStreaming).toBe(false);
    });

    it('finalizeLastAIMessage fallback', () => {
        const {result} = renderHook(() => useChatHistory());

        result.current.finalizeLastAIMessage({message: {model: 'gpt-4'}});

        const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
        const updatedHistory = updater([{type: AI, text: 'old text', model: 'old-model', _key: 'ai-1'}]);
        expect(updatedHistory[0].text).toBe('old text');
        expect(updatedHistory[0].model).toBe('gpt-4');
    });

    it('ensureChatIdFromResponse', () => {
        const {result} = renderHook(() => useChatHistory());

        result.current.ensureChatIdFromResponse({id: 'new-chat-id'});

        expect(sharedState.setChatId).toHaveBeenCalledTimes(1);
        const setChatIdUpdater = sharedState.setChatId.mock.calls[0][0];
        expect(setChatIdUpdater(null)).toBe('new-chat-id');
    });

    it('ensureChatIdFromResponse no-op', () => {
        sharedState.chatId = 'existing-chat-id';
        const {result} = renderHook(() => useChatHistory());

        result.current.ensureChatIdFromResponse({id: 'new-chat-id'});

        expect(sharedState.setChatId).toHaveBeenCalledTimes(1);
        const setChatIdUpdater = sharedState.setChatId.mock.calls[0][0];
        expect(setChatIdUpdater('existing-chat-id')).toBe('existing-chat-id');
    });
});
