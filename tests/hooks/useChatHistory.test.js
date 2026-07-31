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
                {type: AI, text: 'hello', model: 'model-1', messageId: 'msg-1', attachments: [], generatedImages: [], _key: 'msg-1'},
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
            {type: 'USER', text: 'question', model: undefined, messageId: 'msg-1', attachments: [], generatedImages: [], _key: 'msg-1'},
            {
                type: AI,
                text: 'answer',
                model: 'model-1',
                messageId: 'msg-2',
                attachments: [],
                generatedImages: [],
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

// ---------------------------------------------------------------------------
// appendNotificationToLastAIMessage
// ---------------------------------------------------------------------------

describe('appendNotificationToLastAIMessage', () => {
    let sharedState;

    beforeEach(() => {
        sharedState = {
            chatId: null,
            setChatId: vi.fn(),
            chatHistory: [{type: AI, text: 'seed', _key: 'seed'}],
            setChatHistory: vi.fn(),
        };
        useSharedData.mockReturnValue(sharedState);
        chatService.findChatDetails.mockResolvedValue({chatMessages: []});
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('ignores null input — does not append to history', () => {
        const {result} = renderHook(() => useChatHistory());
        const callsBefore = sharedState.setChatHistory.mock.calls.length;

        result.current.appendNotificationToLastAIMessage(null);

        expect(sharedState.setChatHistory.mock.calls.length).toBe(callsBefore);
    });

    it('ignores empty string input — does not append to history', () => {
        const {result} = renderHook(() => useChatHistory());
        const callsBefore = sharedState.setChatHistory.mock.calls.length;

        result.current.appendNotificationToLastAIMessage('');

        expect(sharedState.setChatHistory.mock.calls.length).toBe(callsBefore);
    });

    it('ignores whitespace-only input — does not append to history', () => {
        const {result} = renderHook(() => useChatHistory());
        const callsBefore = sharedState.setChatHistory.mock.calls.length;

        result.current.appendNotificationToLastAIMessage('   ');

        expect(sharedState.setChatHistory.mock.calls.length).toBe(callsBefore);
    });

    it('appends to the notifications array on the last AI message', () => {
        const {result} = renderHook(() => useChatHistory());

        result.current.appendNotificationToLastAIMessage('Step complete');

        const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
        const history = [{type: AI, text: 'hello', _key: 'ai-1', notifications: ['previous']}];
        const updatedHistory = updater(history);

        expect(updatedHistory[0].notifications).toEqual(['previous', 'Step complete']);
    });

    it('creates notifications array when none exists on the last AI message', () => {
        const {result} = renderHook(() => useChatHistory());

        result.current.appendNotificationToLastAIMessage('Step complete');

        const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
        const history = [{type: AI, text: 'hello', _key: 'ai-1'}];
        const updatedHistory = updater(history);

        expect(updatedHistory[0].notifications).toEqual(['Step complete']);
    });

    it('does nothing when the last message is not type AI', () => {
        const {result} = renderHook(() => useChatHistory());

        result.current.appendNotificationToLastAIMessage('Step complete');

        const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
        const history = [{type: 'USER', text: 'question', _key: 'user-1'}];
        const updatedHistory = updater(history);

        expect(updatedHistory).toBe(history);
    });

    it('does nothing when history is empty', () => {
        const {result} = renderHook(() => useChatHistory());

        result.current.appendNotificationToLastAIMessage('Step complete');

        const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
        const emptyHistory = [];
        const updatedHistory = updater(emptyHistory);

        expect(updatedHistory).toBe(emptyHistory);
    });
});

// ---------------------------------------------------------------------------
// mergeFetchedChatHistoryWithLocalNotifications (via setChatHistory updater)
// ---------------------------------------------------------------------------

describe('mergeFetchedChatHistoryWithLocalNotifications', () => {
    let sharedState;

    beforeEach(() => {
        sharedState = {
            chatId: 'chat-1',
            setChatId: vi.fn(),
            chatHistory: [],
            setChatHistory: vi.fn(),
        };
        useSharedData.mockReturnValue(sharedState);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('empty fetched history with no local AI+notifications → returns empty array', async () => {
        chatService.findChatDetails.mockResolvedValue({chatMessages: []});

        renderHook(() => useChatHistory());

        await waitFor(() => expect(sharedState.setChatHistory).toHaveBeenCalled());

        const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
        const previousHistory = [{type: 'USER', text: 'question', _key: 'u1'}];
        const result = updater(previousHistory);

        expect(result).toEqual([]);
    });

    it('empty fetched history where last local message is AI with notifications → returns previousHistory', async () => {
        chatService.findChatDetails.mockResolvedValue({chatMessages: []});

        renderHook(() => useChatHistory());

        await waitFor(() => expect(sharedState.setChatHistory).toHaveBeenCalled());

        const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
        const previousHistory = [
            {type: AI, text: 'answer', _key: 'ai-1', notifications: ['notification']},
        ];
        const result = updater(previousHistory);

        expect(result).toBe(previousHistory);
    });

    it('non-empty fetched history, last local is not AI → returns fetched history as-is', async () => {
        chatService.findChatDetails.mockResolvedValue({
            chatMessages: [
                {id: 'msg-1', messageType: AI, message: 'answer', model: 'gpt-4'},
            ],
        });

        renderHook(() => useChatHistory());

        await waitFor(() => expect(sharedState.setChatHistory).toHaveBeenCalled());

        const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
        const previousHistory = [
            {type: 'USER', text: 'question', _key: 'u1'},
        ];
        const result = updater(previousHistory);

        expect(result).toEqual([
            {type: AI, text: 'answer', model: 'gpt-4', messageId: 'msg-1', attachments: [], generatedImages: [], _key: 'msg-1'},
        ]);
    });

    it('keeps a live streaming placeholder when hydration lands mid-stream', async () => {
        chatService.findChatDetails.mockResolvedValue({
            chatMessages: [
                {id: 'msg-1', messageType: 'USER', message: 'question'},
            ],
        });

        renderHook(() => useChatHistory());

        await waitFor(() => expect(sharedState.setChatHistory).toHaveBeenCalled());

        const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
        const streamingMessage = {type: AI, text: 'The capital of', _key: 'ai-live', isStreaming: true};
        const result = updater([
            {type: 'USER', text: 'question', _key: 'u1'},
            streamingMessage,
        ]);

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({type: 'USER', messageId: 'msg-1'});
        expect(result[1]).toBe(streamingMessage);
    });

    it('drops the server\'s partial AI row rather than rendering a second bubble', async () => {
        chatService.findChatDetails.mockResolvedValue({
            chatMessages: [
                {id: 'msg-1', messageType: 'USER', message: 'question'},
                {id: 'msg-2', messageType: AI, message: ''},
            ],
        });

        renderHook(() => useChatHistory());

        await waitFor(() => expect(sharedState.setChatHistory).toHaveBeenCalled());

        const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
        const streamingMessage = {type: AI, text: 'The capital of', _key: 'ai-live', isStreaming: true};
        const result = updater([
            {type: 'USER', text: 'question', _key: 'u1'},
            streamingMessage,
        ]);

        expect(result).toHaveLength(2);
        expect(result[1]).toBe(streamingMessage);
        expect(result[1].text).toBe('The capital of');
    });

    it('non-empty fetched history, last local is AI with notifications, last fetched is not AI → appends local AI message with notifications', async () => {
        chatService.findChatDetails.mockResolvedValue({
            chatMessages: [
                {id: 'msg-1', messageType: 'USER', message: 'question'},
            ],
        });

        renderHook(() => useChatHistory());

        await waitFor(() => expect(sharedState.setChatHistory).toHaveBeenCalled());

        const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
        const previousHistory = [
            {type: 'USER', text: 'question', _key: 'u1'},
            {type: AI, text: 'answer', _key: 'ai-1', notifications: ['notification']},
        ];
        const result = updater(previousHistory);

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({type: 'USER', text: 'question'});
        expect(result[1]).toMatchObject({
            type: AI,
            notifications: ['notification'],
        });
    });
});

// ---------------------------------------------------------------------------
// hydration suppression for a chat id adopted mid-stream
// ---------------------------------------------------------------------------

describe('hydration on chatId change', () => {
    let sharedState;

    beforeEach(() => {
        sharedState = {
            chatId: null,
            setChatId: vi.fn(),
            chatHistory: [{type: AI, text: 'seed', _key: 'seed'}],
            setChatHistory: vi.fn(),
        };
        useSharedData.mockReturnValue(sharedState);
        chatService.findChatDetails.mockResolvedValue({chatMessages: []});
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('does not hydrate for an id adopted from this client\'s own in-flight stream', async () => {
        const {result, rerender} = renderHook(() => useChatHistory());

        result.current.ensureChatIdFromResponse({id: 'chat-streaming'});
        sharedState.chatId = 'chat-streaming';
        rerender();

        await waitFor(() => expect(sharedState.setChatId).toHaveBeenCalled());
        expect(chatService.findChatDetails).not.toHaveBeenCalled();
    });

    it('hydrates when the user selects a chat from the sidebar', async () => {
        const {rerender} = renderHook(() => useChatHistory());

        sharedState.chatId = 'chat-selected';
        rerender();

        await waitFor(() => {
            expect(chatService.findChatDetails).toHaveBeenCalledWith('chat-selected');
        });
    });

    it('hydrates on returning to a chat whose id was adopted during an earlier stream', async () => {
        const {result, rerender} = renderHook(() => useChatHistory());

        result.current.ensureChatIdFromResponse({id: 'chat-a'});
        sharedState.chatId = 'chat-a';
        rerender();

        expect(chatService.findChatDetails).not.toHaveBeenCalled();

        sharedState.chatId = 'chat-b';
        rerender();

        await waitFor(() => {
            expect(chatService.findChatDetails).toHaveBeenCalledWith('chat-b');
        });

        sharedState.chatId = 'chat-a';
        rerender();

        await waitFor(() => {
            expect(chatService.findChatDetails).toHaveBeenCalledWith('chat-a');
        });
    });
});

describe('attachment-aware chat history', () => {
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

    describe('ensureChatIdFromResponse', () => {
        it('adopts the chat id from the `id` key', () => {
            const {result} = renderHook(() => useChatHistory());

            result.current.ensureChatIdFromResponse({id: 'chat-from-id'});

            const chatIdUpdater = sharedState.setChatId.mock.calls.at(-1)[0];
            expect(chatIdUpdater(null)).toBe('chat-from-id');
        });

        it('adopts the chat id from the `chatId` key', () => {
            const {result} = renderHook(() => useChatHistory());

            result.current.ensureChatIdFromResponse({chatId: 'chat-from-chatid'});

            const chatIdUpdater = sharedState.setChatId.mock.calls.at(-1)[0];
            expect(chatIdUpdater(null)).toBe('chat-from-chatid');
        });

        it('prefers `id` when both keys are present', () => {
            const {result} = renderHook(() => useChatHistory());

            result.current.ensureChatIdFromResponse({id: 'from-id', chatId: 'from-chatid'});

            const chatIdUpdater = sharedState.setChatId.mock.calls.at(-1)[0];
            expect(chatIdUpdater(null)).toBe('from-id');
        });

        it('leaves an already-set chat id alone', () => {
            const {result} = renderHook(() => useChatHistory());

            result.current.ensureChatIdFromResponse({chatId: 'new-chat'});

            const chatIdUpdater = sharedState.setChatId.mock.calls.at(-1)[0];
            expect(chatIdUpdater('existing-chat')).toBe('existing-chat');
        });

        it('ignores a payload carrying neither key', () => {
            const {result} = renderHook(() => useChatHistory());
            sharedState.setChatId.mockClear();

            result.current.ensureChatIdFromResponse({messageId: 'msg-1'});

            expect(sharedState.setChatId).not.toHaveBeenCalled();
        });
    });

    describe('attachments mapping', () => {
        it('carries attachments through from a fetched USER message', async () => {
            sharedState.chatId = 'chat-1';
            const attachmentSummary = {id: 'attachment-1', fileName: 'a.png', description: 'the banner'};
            chatService.findChatDetails.mockResolvedValue({
                chatMessages: [
                    {id: 'msg-1', messageType: 'USER', message: 'look', attachments: [attachmentSummary]},
                ],
            });

            renderHook(() => useChatHistory());

            await waitFor(() => expect(sharedState.setChatHistory).toHaveBeenCalled());

            const mappedHistory = sharedState.setChatHistory.mock.calls.at(-1)[0]([]);
            expect(mappedHistory[0].attachments).toEqual([attachmentSummary]);
            expect(mappedHistory[0].messageId).toBe('msg-1');
        });

        it('normalises a missing or null attachments field to an empty array', async () => {
            sharedState.chatId = 'chat-1';
            chatService.findChatDetails.mockResolvedValue({
                chatMessages: [
                    {id: 'msg-1', messageType: 'USER', message: 'no attachments'},
                    {id: 'msg-2', messageType: 'USER', message: 'null attachments', attachments: null},
                ],
            });

            renderHook(() => useChatHistory());

            await waitFor(() => expect(sharedState.setChatHistory).toHaveBeenCalled());

            const mappedHistory = sharedState.setChatHistory.mock.calls.at(-1)[0]([]);
            expect(mappedHistory[0].attachments).toEqual([]);
            expect(mappedHistory[1].attachments).toEqual([]);
        });

        it('still skips progressData rows and folds them into the following AI message', async () => {
            sharedState.chatId = 'chat-1';
            chatService.findChatDetails.mockResolvedValue({
                chatMessages: [
                    {id: 'msg-1', messageType: 'USER', message: 'look', attachments: [{id: 'attachment-1'}]},
                    {id: 'msg-2', messageType: AI, message: '', progressData: {message: 'Reading attached image a.png'}},
                    {id: 'msg-3', messageType: AI, message: 'I see a banner'},
                ],
            });

            renderHook(() => useChatHistory());

            await waitFor(() => expect(sharedState.setChatHistory).toHaveBeenCalled());

            const mappedHistory = sharedState.setChatHistory.mock.calls.at(-1)[0]([]);
            expect(mappedHistory).toHaveLength(2);
            expect(mappedHistory[0].attachments).toEqual([{id: 'attachment-1'}]);
            expect(mappedHistory[1].notifications).toEqual(['Reading attached image a.png']);
        });
    });

    describe('seeded vision notification', () => {
        it('replaces the seeded step with the first real progress frame', () => {
            const {result} = renderHook(() => useChatHistory());

            result.current.appendNotificationToLastAIMessage('Reading attached image screenshot.png');

            const historyUpdater = sharedState.setChatHistory.mock.calls.at(-1)[0];
            const updatedHistory = historyUpdater([
                {type: 'USER', text: 'look', _key: 'u1'},
                {type: AI, text: '', _key: 'ai1', notifications: ['Reading 1 image…'], hasSeededNotification: true},
            ]);

            expect(updatedHistory[1].notifications).toEqual(['Reading attached image screenshot.png']);
            expect(updatedHistory[1].hasSeededNotification).toBe(false);
        });

        it('appends normally once the seed has been replaced', () => {
            const {result} = renderHook(() => useChatHistory());

            result.current.appendNotificationToLastAIMessage('Second step');

            const historyUpdater = sharedState.setChatHistory.mock.calls.at(-1)[0];
            const updatedHistory = historyUpdater([
                {type: AI, text: '', _key: 'ai1', notifications: ['First step'], hasSeededNotification: false},
            ]);

            expect(updatedHistory[0].notifications).toEqual(['First step', 'Second step']);
        });
    });

    describe('unfulfilled vision seed', () => {
        function finalizeWith(previousHistory) {
            const {result} = renderHook(() => useChatHistory());

            result.current.finalizeLastAIMessage({message: {message: 'done', model: 'llama'}});

            const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];

            return updater(previousHistory);
        }

        it('drops a seeded step the backend never replaced, rather than marking it completed', () => {
            const updatedHistory = finalizeWith([{
                type: AI,
                text: '',
                _key: 'ai-1',
                notifications: ['Reading 1 image…'],
                hasSeededNotification: true,
            }]);

            expect(updatedHistory[0].notifications).toEqual([]);
            expect(updatedHistory[0].hasSeededNotification).toBe(false);
            expect(updatedHistory[0].visionStepUnconfirmed).toBe(true);
        });

        it('keeps real progress steps and does not flag the turn', () => {
            const updatedHistory = finalizeWith([{
                type: AI,
                text: '',
                _key: 'ai-1',
                notifications: ['Reading attached image screenshot.png'],
                hasSeededNotification: false,
            }]);

            expect(updatedHistory[0].notifications).toEqual(['Reading attached image screenshot.png']);
            expect(updatedHistory[0].visionStepUnconfirmed).toBe(false);
        });
    });

    describe('updateSeededNotificationText', () => {
        it('rewrites the seeded step while leaving it seeded', () => {
            const {result} = renderHook(() => useChatHistory());

            result.current.updateSeededNotificationText('Still reading…');

            const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
            const updatedHistory = updater([{
                type: AI,
                text: '',
                _key: 'ai-1',
                notifications: ['Reading 1 image…'],
                hasSeededNotification: true,
            }]);

            expect(updatedHistory[0].notifications).toEqual(['Still reading…']);
            expect(updatedHistory[0].hasSeededNotification).toBe(true);
        });

        it('leaves a log the backend already owns alone', () => {
            const {result} = renderHook(() => useChatHistory());

            result.current.updateSeededNotificationText('Still reading…');

            const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
            const previousHistory = [{
                type: AI,
                text: '',
                _key: 'ai-1',
                notifications: ['Reading attached image screenshot.png'],
                hasSeededNotification: false,
            }];

            expect(updater(previousHistory)).toBe(previousHistory);
        });
    });

    describe('stopStreamingLastAIMessage', () => {
        it('clears the streaming flag on the last AI entry', () => {
            const {result} = renderHook(() => useChatHistory());

            result.current.stopStreamingLastAIMessage();

            const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
            const updatedHistory = updater([{type: AI, text: 'partial', _key: 'ai-1', isStreaming: true}]);

            expect(updatedHistory[0].isStreaming).toBe(false);
            expect(updatedHistory[0].text).toBe('partial');
        });

        it('leaves history untouched when the last entry is not an AI message', () => {
            const {result} = renderHook(() => useChatHistory());

            result.current.stopStreamingLastAIMessage();

            const updater = sharedState.setChatHistory.mock.calls.at(-1)[0];
            const previousHistory = [{type: 'USER', text: 'question', _key: 'u1'}];

            expect(updater(previousHistory)).toBe(previousHistory);
        });
    });

    describe('adoptMessageIdForLastUserMessage', () => {
        it('sets messageId on the last USER entry without touching its _key', () => {
            const {result} = renderHook(() => useChatHistory());

            result.current.adoptMessageIdForLastUserMessage('msg-99');

            const historyUpdater = sharedState.setChatHistory.mock.calls.at(-1)[0];
            const updatedHistory = historyUpdater([
                {type: 'USER', text: 'first', _key: 'u1'},
                {type: 'USER', text: 'second', _key: 'u2'},
                {type: AI, text: '', _key: 'ai1'},
            ]);

            expect(updatedHistory[1]).toMatchObject({messageId: 'msg-99', _key: 'u2'});
            expect(updatedHistory[0].messageId).toBeUndefined();
        });

        it('is a no-op without a message id', () => {
            const {result} = renderHook(() => useChatHistory());
            sharedState.setChatHistory.mockClear();

            result.current.adoptMessageIdForLastUserMessage(undefined);

            expect(sharedState.setChatHistory).not.toHaveBeenCalled();
        });

        it('leaves history untouched when there is no USER entry', () => {
            const {result} = renderHook(() => useChatHistory());

            result.current.adoptMessageIdForLastUserMessage('msg-99');

            const historyUpdater = sharedState.setChatHistory.mock.calls.at(-1)[0];
            const previousHistory = [{type: AI, text: 'only ai', _key: 'ai1'}];

            expect(historyUpdater(previousHistory)).toBe(previousHistory);
        });
    });
});
