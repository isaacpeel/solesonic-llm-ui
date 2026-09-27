import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import chatService, {
    CUSTOM,
    CUSTOM_ATTACHMENT,
    CUSTOM_CANCEL,
    CUSTOM_FAILURE,
    CUSTOM_PROGRESS,
    RESUME_ALREADY_COMPLETE,
    RESUME_REJECTED,
    RESUME_STREAMED,
    RESUME_UNAVAILABLE,
    RUN_ERROR,
    RUN_FINISHED,
    RUN_STARTED,
    TEXT_MESSAGE_CONTENT,
    TEXT_MESSAGE_END,
    TEXT_MESSAGE_START,
    TOOL_CALL_ARGS,
    TOOL_CALL_END,
    TOOL_CALL_START,
    findRunStartedUserMessageId,
} from '../src/service/ChatService.js';
import authClient from "../src/service/AuthService.js";

vi.mock('../src/client/ApiClient.js', () => ({
    default: {
        get: vi.fn().mockResolvedValue({chatDetails: {}}),
        post: vi.fn().mockResolvedValue({success: true}),
        put: vi.fn().mockResolvedValue({success: true}),
        delete: vi.fn().mockResolvedValue(null),
    },
}));

vi.mock('../src/properties/ApplicationProperties', () => ({
    default: {
        chatsUri: 'https://api.example.com/chat',
        streamingChatsUri: 'https://api.example.com/stream',
        apiBaseUri: 'https://api.example.com',
    },
}));

vi.mock('../src/client/parseSseStream.js', () => ({
    parseSseStream: vi.fn(),
}));

import apiClient from '../src/client/ApiClient.js';
import { parseSseStream } from '../src/client/parseSseStream.js';

beforeEach(() => {
    authClient.getAccessToken = vi.fn(async () => 'mock-access-token');
    authClient.getUserId = vi.fn(async () => 'mock-user-id');
});

afterEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// findChatDetails / findChatHistory
// ---------------------------------------------------------------------------

describe('findChatDetails', () => {
    it('calls apiClient.get with the chat URI and returns the result', async () => {
        apiClient.get.mockResolvedValue({chatMessages: []});

        const result = await chatService.findChatDetails('67890');

        expect(apiClient.get).toHaveBeenCalledWith('https://api.example.com/chat/67890');
        expect(result).toEqual({chatMessages: []});
    });
});

describe('renameChat', () => {
    it('puts the name to the chat name endpoint, with no userId in the path', async () => {
        apiClient.put.mockResolvedValue({id: '67890', name: 'Trip planning'});

        await chatService.renameChat('67890', 'Trip planning');

        expect(apiClient.put).toHaveBeenCalledWith(
            'https://api.example.com/chat/67890/name',
            {name: 'Trip planning'},
        );
    });

    it('returns the parsed chat unchanged', async () => {
        const renamedChat = {id: '67890', name: 'Trip planning', chatMessages: []};
        apiClient.put.mockResolvedValue(renamedChat);

        expect(await chatService.renameChat('67890', 'Trip planning')).toBe(renamedChat);
    });
});

describe('deleteChat', () => {
    it('deletes the chat by id and returns null for the 204', async () => {
        apiClient.delete.mockResolvedValue(null);

        const result = await chatService.deleteChat('67890');

        expect(apiClient.delete).toHaveBeenCalledWith('https://api.example.com/chat/67890');
        expect(result).toBeNull();
    });

    /* A repeat is a 404, not a 204 — the caller is the one that decides that is not a failure. */
    it('propagates the failure rather than swallowing it', async () => {
        apiClient.delete.mockRejectedValue(Object.assign(new Error('404'), {status: 404}));

        await expect(chatService.deleteChat('67890')).rejects.toMatchObject({status: 404});
    });
});

// ---------------------------------------------------------------------------
// cancelStream
// ---------------------------------------------------------------------------

describe('cancelStream', () => {
    it('posts to the cancel endpoint for the chat and user', async () => {
        apiClient.post.mockResolvedValue(null);

        await chatService.cancelStream('chat-42');

        expect(apiClient.post).toHaveBeenCalledWith(
            'https://api.example.com/stream/chat-42/users/mock-user-id/cancel',
        );
    });

    /* apiClient already normalizes a bodiless 202/204 to null; nothing here should reinterpret it. */
    it('resolves to null on a 202 or 204 ack', async () => {
        apiClient.post.mockResolvedValue(null);

        await expect(chatService.cancelStream('chat-42')).resolves.toBeNull();
    });

    it('propagates a 403/404 rather than swallowing it', async () => {
        apiClient.post.mockRejectedValue(Object.assign(new Error('403'), {status: 403}));

        await expect(chatService.cancelStream('chat-42')).rejects.toMatchObject({status: 403});
    });
});

// ---------------------------------------------------------------------------
// handleStreamChunk
// ---------------------------------------------------------------------------

function makeCallbacks(overrides = {}) {
    return {
        activeElicitation: null,
        chatId: 'chat-1',
        appendToLastAIMessage: vi.fn(),
        appendNotificationMessage: vi.fn(),
        ensureChatIdFromResponse: vi.fn(),
        finalizeLastAIMessage: vi.fn(),
        stopStreamingLastAIMessage: vi.fn(),
        appendSystemMessage: vi.fn(),
        isCancelling: false,
        setActiveElicitation: vi.fn(),
        setElicitationSubmitting: vi.fn(),
        setElicitationValues: vi.fn(),
        appendErrorMessage: vi.fn(),
        ...overrides,
    };
}

function agUiFrame(eventType, fields = {}) {
    return {event: eventType, data: JSON.stringify({type: eventType, ...fields})};
}

function customFrame(name, value) {
    return agUiFrame(CUSTOM, {name, value});
}

function runStartedFrame(messages = [{id: 'user-message-1', role: 'user', content: 'hello'}]) {
    return agUiFrame(RUN_STARTED, {
        threadId: 'chat-1',
        runId: 'run-1',
        input: {threadId: 'chat-1', runId: 'run-1', messages, tools: []},
    });
}

function elicitationArgsFrame(elicitationRequest, toolCallId = 'elicitation-1') {
    return agUiFrame(TOOL_CALL_ARGS, {toolCallId, delta: JSON.stringify(elicitationRequest)});
}

function runFinishedFrame(result) {
    return agUiFrame(RUN_FINISHED, {threadId: 'chat-1', runId: 'run-1', result});
}

function expectNoStreamHandlerCalled(callbacks) {
    expect(callbacks.appendToLastAIMessage).not.toHaveBeenCalled();
    expect(callbacks.appendNotificationMessage).not.toHaveBeenCalled();
    expect(callbacks.ensureChatIdFromResponse).not.toHaveBeenCalled();
    expect(callbacks.finalizeLastAIMessage).not.toHaveBeenCalled();
    expect(callbacks.stopStreamingLastAIMessage).not.toHaveBeenCalled();
    expect(callbacks.appendSystemMessage).not.toHaveBeenCalled();
    expect(callbacks.setActiveElicitation).not.toHaveBeenCalled();
    expect(callbacks.appendErrorMessage).not.toHaveBeenCalled();
}

describe('handleStreamChunk', () => {
    it('RUN_STARTED adopts the chat id from threadId', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(runStartedFrame(), callbacks);

        expect(callbacks.ensureChatIdFromResponse).toHaveBeenCalledWith({chatId: 'chat-1'});
    });

    it('RUN_STARTED adopts the persisted user message id from input.messages', () => {
        const adoptMessageId = vi.fn();

        chatService.handleStreamChunk(runStartedFrame(), makeCallbacks({adoptMessageId}));

        expect(adoptMessageId).toHaveBeenCalledWith('user-message-1');
    });

    it('RUN_STARTED picks the newest user message when input carries earlier turns', () => {
        const adoptMessageId = vi.fn();
        const messages = [
            {id: 'older-user-message', role: 'user', content: 'first'},
            {id: 'assistant-message', role: 'assistant', content: 'reply'},
            {id: 'newest-user-message', role: 'user', content: 'second'},
        ];

        chatService.handleStreamChunk(runStartedFrame(messages), makeCallbacks({adoptMessageId}));

        expect(adoptMessageId).toHaveBeenCalledWith('newest-user-message');
    });

    it('RUN_STARTED passes null when input carries no user message', () => {
        const adoptMessageId = vi.fn();

        chatService.handleStreamChunk(runStartedFrame([]), makeCallbacks({adoptMessageId}));

        expect(adoptMessageId).toHaveBeenCalledWith(null);
    });

    it('RUN_STARTED does not throw when no adoptMessageId handler is supplied', () => {
        const callbacks = makeCallbacks();

        expect(() => chatService.handleStreamChunk(runStartedFrame(), callbacks)).not.toThrow();
        expect(callbacks.ensureChatIdFromResponse).toHaveBeenCalled();
    });

    it('RUN_STARTED with malformed JSON logs and does not throw', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const callbacks = makeCallbacks();

        expect(() => chatService.handleStreamChunk({event: RUN_STARTED, data: 'not-json'}, callbacks)).not.toThrow();
        expect(callbacks.ensureChatIdFromResponse).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it('TEXT_MESSAGE_CONTENT appends the delta', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(agUiFrame(TEXT_MESSAGE_CONTENT, {messageId: 'wire-1', delta: 'hello'}), callbacks);

        expect(callbacks.appendToLastAIMessage).toHaveBeenCalledWith('hello');
    });

    it('TEXT_MESSAGE_CONTENT with an empty or missing delta appends nothing', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(agUiFrame(TEXT_MESSAGE_CONTENT, {messageId: 'wire-1', delta: ''}), callbacks);
        chatService.handleStreamChunk(agUiFrame(TEXT_MESSAGE_CONTENT, {messageId: 'wire-1'}), callbacks);

        expect(callbacks.appendToLastAIMessage).not.toHaveBeenCalled();
    });

    it('TEXT_MESSAGE_CONTENT clears an active elicitation before appending', () => {
        const callbacks = makeCallbacks({activeElicitation: {elicitationId: 'elicitation-1'}});

        chatService.handleStreamChunk(agUiFrame(TEXT_MESSAGE_CONTENT, {messageId: 'wire-1', delta: 'text'}), callbacks);

        expect(callbacks.setActiveElicitation).toHaveBeenCalledWith(null);
        expect(callbacks.setElicitationSubmitting).toHaveBeenCalledWith(false);
        expect(callbacks.appendToLastAIMessage).toHaveBeenCalledWith('text');
    });

    it('TEXT_MESSAGE_CONTENT leaves elicitation state alone when none is active', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(agUiFrame(TEXT_MESSAGE_CONTENT, {messageId: 'wire-1', delta: 'text'}), callbacks);

        expect(callbacks.setActiveElicitation).not.toHaveBeenCalled();
    });

    it('TEXT_MESSAGE_CONTENT is suppressed while the user is cancelling', () => {
        const callbacks = makeCallbacks({isCancelling: true});

        chatService.handleStreamChunk(agUiFrame(TEXT_MESSAGE_CONTENT, {messageId: 'wire-1', delta: 'late token'}), callbacks);

        expect(callbacks.appendToLastAIMessage).not.toHaveBeenCalled();
    });

    it('TEXT_MESSAGE_CONTENT with malformed JSON logs and does not throw', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const callbacks = makeCallbacks();

        expect(() => chatService.handleStreamChunk({event: TEXT_MESSAGE_CONTENT, data: 'not-json'}, callbacks)).not.toThrow();
        expect(callbacks.appendToLastAIMessage).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it('TEXT_MESSAGE_START and TEXT_MESSAGE_END are structural only', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(agUiFrame(TEXT_MESSAGE_START, {messageId: 'wire-1', role: 'assistant'}), callbacks);
        chatService.handleStreamChunk(agUiFrame(TEXT_MESSAGE_END, {messageId: 'wire-1'}), callbacks);

        expectNoStreamHandlerCalled(callbacks);
    });

    it('TOOL_CALL_ARGS opens the elicitation carried in the delta', () => {
        const callbacks = makeCallbacks();
        const elicitationRequest = {
            message: 'Delete PROJ-12?',
            requestedSchema: {properties: {action: {type: 'string', enum: ['accept', 'decline']}}},
            elicitationId: 'elicitation-1',
            chatId: 'chat-1',
        };

        chatService.handleStreamChunk(elicitationArgsFrame(elicitationRequest), callbacks);

        expect(callbacks.setElicitationSubmitting).toHaveBeenCalledWith(false);
        expect(callbacks.setActiveElicitation).toHaveBeenCalledWith(elicitationRequest);
    });

    it('TOOL_CALL_ARGS seeds an empty value for each schema property', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(elicitationArgsFrame({
            requestedSchema: {properties: {name: {}, city: {}}},
            elicitationId: 'elicitation-1',
            chatId: 'chat-1',
        }), callbacks);

        expect(callbacks.setElicitationValues).toHaveBeenCalledWith({name: '', city: ''});
    });

    it('TOOL_CALL_ARGS seeds a chatId property from _meta.chatId first', () => {
        const callbacks = makeCallbacks({chatId: 'fallback-chat'});

        chatService.handleStreamChunk(elicitationArgsFrame({
            _meta: {chatId: 'meta-chat-id'},
            chatId: 'top-level-chat-id',
            elicitationId: 'elicitation-1',
            requestedSchema: {properties: {chatId: {}}},
        }), callbacks);

        expect(callbacks.setElicitationValues).toHaveBeenCalledWith({chatId: 'meta-chat-id'});
    });

    it('TOOL_CALL_ARGS seeds a chatId property from the request chatId when _meta has none', () => {
        const callbacks = makeCallbacks({chatId: 'fallback-chat'});

        chatService.handleStreamChunk(elicitationArgsFrame({
            chatId: 'top-level-chat-id',
            elicitationId: 'elicitation-1',
            requestedSchema: {properties: {chatId: {}}},
        }), callbacks);

        expect(callbacks.setElicitationValues).toHaveBeenCalledWith({chatId: 'top-level-chat-id'});
    });

    it('TOOL_CALL_ARGS ignores a tool call that is not an elicitation', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(
            agUiFrame(TOOL_CALL_ARGS, {toolCallId: 'tool-call-7', delta: JSON.stringify({query: 'weather'})}),
            callbacks,
        );

        expect(callbacks.setActiveElicitation).not.toHaveBeenCalled();
        expect(callbacks.setElicitationValues).not.toHaveBeenCalled();
    });

    it('TOOL_CALL_ARGS without a toolCallId is not an elicitation', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(agUiFrame(TOOL_CALL_ARGS, {delta: JSON.stringify({message: 'no id anywhere'})}), callbacks);
        chatService.handleStreamChunk(agUiFrame(TOOL_CALL_ARGS, {delta: '"just a string"'}), callbacks);

        expect(callbacks.setActiveElicitation).not.toHaveBeenCalled();
        expect(callbacks.setElicitationValues).not.toHaveBeenCalled();
    });

    it('TOOL_CALL_ARGS with an unparseable delta logs and does not throw', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const callbacks = makeCallbacks();

        expect(() => chatService.handleStreamChunk(
            agUiFrame(TOOL_CALL_ARGS, {toolCallId: 'elicitation-1', delta: '{not json'}),
            callbacks,
        )).not.toThrow();
        expect(callbacks.setActiveElicitation).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it('TOOL_CALL_START and TOOL_CALL_END are structural only', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(agUiFrame(TOOL_CALL_START, {toolCallId: 'elicitation-1', toolCallName: 'elicitation'}), callbacks);
        chatService.handleStreamChunk(agUiFrame(TOOL_CALL_END, {toolCallId: 'elicitation-1'}), callbacks);

        expectNoStreamHandlerCalled(callbacks);
    });

    it('RUN_FINISHED resolves the chat id and finalizes the bubble from result', () => {
        const callbacks = makeCallbacks();
        const result = {id: 'chat-1', message: {messageType: 'ASSISTANT', message: 'final text'}};

        chatService.handleStreamChunk(runFinishedFrame(result), callbacks);

        expect(callbacks.ensureChatIdFromResponse).toHaveBeenCalledWith(result);
        expect(callbacks.finalizeLastAIMessage).toHaveBeenCalledWith(result);
        expect(callbacks.stopStreamingLastAIMessage).not.toHaveBeenCalled();
        expect(callbacks.appendSystemMessage).not.toHaveBeenCalled();
    });

    it('RUN_FINISHED always clears elicitation state', () => {
        const callbacks = makeCallbacks({activeElicitation: {elicitationId: 'elicitation-1'}});

        chatService.handleStreamChunk(runFinishedFrame({id: 'chat-1'}), callbacks);

        expect(callbacks.setActiveElicitation).toHaveBeenCalledWith(null);
        expect(callbacks.setElicitationSubmitting).toHaveBeenCalledWith(false);
    });

    it('RUN_FINISHED clears elicitation state even when its payload cannot be parsed', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk({event: RUN_FINISHED, data: 'not-json'}, callbacks);

        expect(callbacks.setActiveElicitation).toHaveBeenCalledWith(null);
        expect(callbacks.setElicitationSubmitting).toHaveBeenCalledWith(false);
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it('RUN_FINISHED that cannot be parsed still stops the streaming bubble — the turn is over', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk({event: RUN_FINISHED, data: 'not-json'}, callbacks);

        expect(callbacks.stopStreamingLastAIMessage).toHaveBeenCalledTimes(1);
        expect(callbacks.finalizeLastAIMessage).not.toHaveBeenCalled();
        consoleError.mockRestore();
    });

    /*
     * A cancelled turn persists a SYSTEM message ("Chat canceled.") rather than the partial
     * answer. Finalizing with it would erase everything the user already watched stream in.
     */
    it('RUN_FINISHED for a cancelled turn stops the bubble and appends the system message', () => {
        const callbacks = makeCallbacks();
        const result = {id: 'chat-1', message: {messageType: 'SYSTEM', message: 'Chat canceled.'}};

        chatService.handleStreamChunk(runFinishedFrame(result), callbacks);

        expect(callbacks.finalizeLastAIMessage).not.toHaveBeenCalled();
        expect(callbacks.stopStreamingLastAIMessage).toHaveBeenCalledTimes(1);
        expect(callbacks.appendSystemMessage).toHaveBeenCalledWith('Chat canceled.');
        expect(callbacks.ensureChatIdFromResponse).toHaveBeenCalledWith(result);
    });

    it('RUN_ERROR surfaces its message', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(agUiFrame(RUN_ERROR, {message: 'The model timed out.', code: 'timeout'}), callbacks);

        expect(callbacks.appendErrorMessage).toHaveBeenCalledOnce();
        expect(callbacks.appendErrorMessage).toHaveBeenCalledWith('The model timed out.');
        expect(callbacks.appendToLastAIMessage).not.toHaveBeenCalled();
    });

    it('RUN_ERROR ends the turn: the bubble stops streaming and any open elicitation closes', () => {
        const callbacks = makeCallbacks({activeElicitation: {elicitationId: 'elicitation-1'}});

        chatService.handleStreamChunk(agUiFrame(RUN_ERROR, {message: 'The model timed out.', code: 'timeout'}), callbacks);

        expect(callbacks.stopStreamingLastAIMessage).toHaveBeenCalledTimes(1);
        expect(callbacks.setActiveElicitation).toHaveBeenCalledWith(null);
        expect(callbacks.setElicitationSubmitting).toHaveBeenCalledWith(false);
        expect(callbacks.finalizeLastAIMessage).not.toHaveBeenCalled();
    });

    it('RUN_ERROR that cannot be parsed still ends the turn', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk({event: RUN_ERROR, data: 'not-json'}, callbacks);

        expect(callbacks.stopStreamingLastAIMessage).toHaveBeenCalledTimes(1);
        consoleError.mockRestore();
    });

    it('RUN_ERROR without a message stays quiet', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(agUiFrame(RUN_ERROR, {code: 'internal'}), callbacks);

        expect(callbacks.appendErrorMessage).not.toHaveBeenCalled();
    });

    it('RUN_ERROR with malformed JSON logs and does not throw', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const callbacks = makeCallbacks();

        expect(() => chatService.handleStreamChunk({event: RUN_ERROR, data: 'not-json'}, callbacks)).not.toThrow();
        expect(callbacks.appendErrorMessage).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it('CUSTOM progress appends a step to the notification log', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(customFrame(CUSTOM_PROGRESS, {
            progressToken: 'token-1',
            message: 'Step 1 done',
            progress: 1,
            total: 3,
        }), callbacks);

        expect(callbacks.appendNotificationMessage).toHaveBeenCalledWith('Step 1 done 33%');
        expect(callbacks.appendToLastAIMessage).not.toHaveBeenCalled();
    });

    it('CUSTOM progress with nothing to show appends nothing', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(customFrame(CUSTOM_PROGRESS, {progressToken: 'token-1'}), callbacks);

        expect(callbacks.appendNotificationMessage).not.toHaveBeenCalled();
    });

    it('CUSTOM attachment forwards its value to updateAttachmentStatus', () => {
        const updateAttachmentStatus = vi.fn();
        const attachmentOutcome = {
            attachmentId: 'attachment-1',
            chatId: 'chat-1',
            described: false,
            reason: 'VISION_TIMEOUT',
            indexed: false,
            extractionReason: null,
            chunkCount: null,
        };

        chatService.handleStreamChunk(customFrame(CUSTOM_ATTACHMENT, attachmentOutcome), makeCallbacks({updateAttachmentStatus}));

        expect(updateAttachmentStatus).toHaveBeenCalledWith(attachmentOutcome);
    });

    it('CUSTOM attachment does not throw without an updateAttachmentStatus handler', () => {
        expect(() => chatService.handleStreamChunk(
            customFrame(CUSTOM_ATTACHMENT, {attachmentId: 'attachment-1', described: true}),
            makeCallbacks(),
        )).not.toThrow();
    });

    it('CUSTOM failure surfaces its content without ending the bubble', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(customFrame(CUSTOM_FAILURE, {content: 'the model refused'}), callbacks);

        expect(callbacks.appendErrorMessage).toHaveBeenCalledWith('the model refused');
        expect(callbacks.finalizeLastAIMessage).not.toHaveBeenCalled();
        expect(callbacks.stopStreamingLastAIMessage).not.toHaveBeenCalled();
    });

    it('CUSTOM failure falls back to message when content is absent', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(
            customFrame(CUSTOM_FAILURE, {code: 'GENERATION_TIMEOUT', message: 'image generation timed out'}),
            callbacks,
        );

        expect(callbacks.appendErrorMessage).toHaveBeenCalledWith('image generation timed out');
    });

    it('CUSTOM failure prefers content when both are present', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(customFrame(CUSTOM_FAILURE, {content: 'the real one', message: 'the other one'}), callbacks);

        expect(callbacks.appendErrorMessage).toHaveBeenCalledWith('the real one');
    });

    it('CUSTOM failure stays quiet when it carries no text', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(customFrame(CUSTOM_FAILURE, {code: 'GENERATION_TIMEOUT'}), callbacks);

        expect(callbacks.appendErrorMessage).not.toHaveBeenCalled();
    });

    it('CUSTOM cancel is a marker only — RUN_FINISHED carries the outcome', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(customFrame(CUSTOM_CANCEL, null), callbacks);

        expectNoStreamHandlerCalled(callbacks);
    });

    it('ignores events it does not route, including the retired vocabulary', () => {
        const callbacks = makeCallbacks();

        chatService.handleStreamChunk(agUiFrame('STATE_SNAPSHOT', {snapshot: {}}), callbacks);
        chatService.handleStreamChunk({event: 'chunk', data: JSON.stringify({content: 'hello'})}, callbacks);
        chatService.handleStreamChunk({event: 'done', data: JSON.stringify({id: 'chat-1'})}, callbacks);

        expectNoStreamHandlerCalled(callbacks);
    });
});

describe('findRunStartedUserMessageId', () => {
    it('returns the newest user message id', () => {
        expect(findRunStartedUserMessageId({
            input: {
                messages: [
                    {id: 'older', role: 'user'},
                    {id: 'newest', role: 'user'},
                ],
            },
        })).toBe('newest');
    });

    it('returns null for a missing or malformed input', () => {
        expect(findRunStartedUserMessageId(null)).toBeNull();
        expect(findRunStartedUserMessageId({input: {}})).toBeNull();
        expect(findRunStartedUserMessageId({input: {messages: [{id: 'assistant-1', role: 'assistant'}]}})).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// chatStream
// ---------------------------------------------------------------------------

function makeSseAsyncGenerator(events) {
    return async function* () {
        for (const event of events) {
            yield event;
        }
    };
}

describe('chatStream', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
        authClient.getAccessToken = vi.fn(async () => 'mock-access-token');
        authClient.getUserId = vi.fn(async () => 'mock-user-id');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('happy path — onChunk is called for each frame and the stream exits after RUN_FINISHED', async () => {
        const onChunk = vi.fn();
        const events = [
            runStartedFrame(),
            agUiFrame(TEXT_MESSAGE_CONTENT, {messageId: 'wire-1', delta: 'hi'}),
            runFinishedFrame({id: 'chat-1'}),
        ];

        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator(events));

        await chatService.chatStream('hello', null, {onChunk});

        expect(onChunk).toHaveBeenCalledTimes(3);
    });

    it('RUN_FINISHED stops reading before the stream body closes', async () => {
        const onChunk = vi.fn();
        const events = [
            runFinishedFrame({id: 'chat-1'}),
            agUiFrame(TEXT_MESSAGE_CONTENT, {messageId: 'wire-1', delta: 'should not reach'}),
        ];

        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator(events));

        await chatService.chatStream('hello', null, {onChunk});

        expect(onChunk).toHaveBeenCalledTimes(1);
        expect(onChunk).toHaveBeenCalledWith(events[0]);
    });

    it('RUN_ERROR stops reading — no RUN_FINISHED follows it', async () => {
        const onChunk = vi.fn();
        const events = [
            agUiFrame(RUN_ERROR, {message: 'boom', code: 'internal'}),
            runFinishedFrame({id: 'chat-1'}),
        ];

        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator(events));

        await chatService.chatStream('hello', null, {onChunk});

        expect(onChunk).toHaveBeenCalledTimes(1);
    });

    it('keeps reading across an elicitation — the turn continues on the same connection', async () => {
        const onChunk = vi.fn();
        const events = [
            agUiFrame(TOOL_CALL_START, {toolCallId: 'elicitation-1', toolCallName: 'elicitation'}),
            elicitationArgsFrame({elicitationId: 'elicitation-1', chatId: 'chat-1'}),
            agUiFrame(TOOL_CALL_END, {toolCallId: 'elicitation-1'}),
            runFinishedFrame({id: 'chat-1'}),
        ];

        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator(events));

        await chatService.chatStream('hello', null, {onChunk});

        expect(onChunk).toHaveBeenCalledTimes(4);
    });

    it('server error on open — throws streaming failed error', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

        await expect(chatService.chatStream('hello', null, {})).rejects.toThrow('Streaming failed: 500');
    });

    it('AbortError from fetch — propagates to caller', async () => {
        const abortError = Object.assign(new Error('Aborted'), {name: 'AbortError'});
        vi.mocked(fetch).mockRejectedValue(abortError);

        await expect(chatService.chatStream('hello', null, {})).rejects.toMatchObject({name: 'AbortError'});
    });

    it('null chatId → POST to streamingChatsUri/users/userId', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([runFinishedFrame({id: 'c1'})]));

        await chatService.chatStream('hello', null, {});

        const [capturedUri, capturedInit] = vi.mocked(fetch).mock.calls[0];
        expect(capturedUri).toBe('https://api.example.com/stream/users/mock-user-id');
        expect(capturedInit.method).toBe('POST');
    });

    it('existing chatId → PUT to streamingChatsUri/chatId/users/userId', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([runFinishedFrame({id: 'existing'})]));

        await chatService.chatStream('hello', 'existing', {});

        const [capturedUri, capturedInit] = vi.mocked(fetch).mock.calls[0];
        expect(capturedUri).toBe('https://api.example.com/stream/existing/users/mock-user-id');
        expect(capturedInit.method).toBe('PUT');
    });

    it('string message → body normalized to { chatMessage: string }', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([runFinishedFrame({id: 'c1'})]));

        await chatService.chatStream('hello', null, {});

        const capturedBody = vi.mocked(fetch).mock.calls[0][1].body;
        expect(JSON.parse(capturedBody)).toEqual({chatMessage: 'hello'});
    });

    it('object message → body passed through unchanged', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([runFinishedFrame({id: 'c1'})]));

        await chatService.chatStream({chatMessage: 'from object'}, null, {});

        const capturedBody = vi.mocked(fetch).mock.calls[0][1].body;
        expect(JSON.parse(capturedBody)).toEqual({chatMessage: 'from object'});
    });

    it('object message with attachmentIds → passed through unchanged', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, body: {} });
        parseSseStream.mockImplementation(makeSseAsyncGenerator([runFinishedFrame({id: 'c1'})]));

        await chatService.chatStream({chatMessage: 'look', attachmentIds: ['attachment-1', 'attachment-2']}, null, {});

        const capturedBody = vi.mocked(fetch).mock.calls[0][1].body;
        expect(JSON.parse(capturedBody)).toEqual({
            chatMessage: 'look',
            attachmentIds: ['attachment-1', 'attachment-2'],
        });
    });
});

describe('chatStreamResume', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function makeResponse(status, overrides = {}) {
        return {
            status,
            ok: status >= 200 && status < 300,
            statusText: `status ${status}`,
            body: {},
            ...overrides,
        };
    }

    it('requests the resume endpoint with the cursor as an opaque header', async () => {
        parseSseStream.mockImplementation(async function* () {
            yield {event: RUN_FINISHED, id: '1754062831270-0', data: '{}'};
        });
        fetch.mockResolvedValue(makeResponse(200));

        const outcome = await chatService.chatStreamResume('chat-1', '1754062831251-1', {onChunk: vi.fn()});

        expect(outcome).toBe(RESUME_STREAMED);

        const [requestedUri, requestInit] = fetch.mock.calls[0];
        expect(requestedUri).toBe('https://api.example.com/stream/chat-1/users/mock-user-id/stream');
        expect(requestInit.method).toBe('GET');
        expect(requestInit.headers['Last-Event-ID']).toBe('1754062831251-1');
        expect(requestInit.headers.Accept).toBe('text/event-stream');
        expect(requestInit.headers.Authorization).toBe('Bearer mock-access-token');
    });

    /* The id can come straight from the route param, so dot segments must not reach the URL parser. */
    it('percent-encodes the chat id in the resume path', async () => {
        fetch.mockResolvedValue(makeResponse(204, {body: null}));

        await chatService.chatStreamResume('../admin', '1754062831251-1', {});

        expect(fetch.mock.calls[0][0]).toBe('https://api.example.com/stream/..%2Fadmin/users/mock-user-id/stream');
    });

    it('sends the from-the-beginning sentinel when there is no cursor', async () => {
        parseSseStream.mockImplementation(async function* () {
            yield {event: RUN_FINISHED, id: '1754062831270-0', data: '{}'};
        });
        fetch.mockResolvedValue(makeResponse(200));

        await chatService.chatStreamResume('chat-1', null, {onChunk: vi.fn()});

        expect(fetch.mock.calls[0][1].headers['Last-Event-ID']).toBe('0');
    });

    it('routes replayed frames through onChunk and stops at the terminal frame', async () => {
        parseSseStream.mockImplementation(async function* () {
            yield {event: TEXT_MESSAGE_CONTENT, id: '1754062831260-0', data: '{"delta":"rest"}'};
            yield {event: RUN_FINISHED, id: '1754062831270-0', data: '{}'};
            yield {event: TEXT_MESSAGE_CONTENT, id: '1754062831280-0', data: '{"delta":"never"}'};
        });
        fetch.mockResolvedValue(makeResponse(200));

        const onChunk = vi.fn();
        await chatService.chatStreamResume('chat-1', '1754062831251-1', {onChunk});

        expect(onChunk).toHaveBeenCalledTimes(2);
        expect(onChunk.mock.calls[1][0].event).toBe(RUN_FINISHED);
    });

    it('stops at RUN_ERROR as well', async () => {
        parseSseStream.mockImplementation(async function* () {
            yield {event: RUN_ERROR, id: '1754062831270-0', data: '{"message":"boom"}'};
            yield {event: TEXT_MESSAGE_CONTENT, id: '1754062831280-0', data: '{"delta":"never"}'};
        });
        fetch.mockResolvedValue(makeResponse(200));

        const onChunk = vi.fn();
        await chatService.chatStreamResume('chat-1', '1754062831251-1', {onChunk});

        expect(onChunk).toHaveBeenCalledTimes(1);
    });

    it('reports 204 as nothing left to replay', async () => {
        fetch.mockResolvedValue(makeResponse(204, {body: null}));

        await expect(chatService.chatStreamResume('chat-1', '1754062831251-1', {}))
            .resolves.toBe(RESUME_ALREADY_COMPLETE);
    });

    it('reports an aged-out buffer and an unknown chat as unavailable', async () => {
        fetch.mockResolvedValue(makeResponse(410, {body: null}));
        await expect(chatService.chatStreamResume('chat-1', 'x', {})).resolves.toBe(RESUME_UNAVAILABLE);

        fetch.mockResolvedValue(makeResponse(404, {body: null}));
        await expect(chatService.chatStreamResume('chat-1', 'x', {})).resolves.toBe(RESUME_UNAVAILABLE);
    });

    it('treats a rejected cursor as recoverable but logs it as a client bug', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetch.mockResolvedValue(makeResponse(400, {body: null}));

        await expect(chatService.chatStreamResume('chat-1', 'not-a-cursor', {}))
            .resolves.toBe(RESUME_UNAVAILABLE);

        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });

    it('reports a forbidden chat as rejected so recovery does not keep asking', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetch.mockResolvedValue(makeResponse(403, {body: null}));

        await expect(chatService.chatStreamResume('chat-1', 'x', {})).resolves.toBe(RESUME_REJECTED);

        consoleErrorSpy.mockRestore();
    });

    it('throws on an unexpected server failure', async () => {
        fetch.mockResolvedValue(makeResponse(500, {body: null}));

        await expect(chatService.chatStreamResume('chat-1', 'x', {})).rejects.toThrow('Stream resume failed');
    });
});
