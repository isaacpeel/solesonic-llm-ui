import {describe, it, expect, vi, afterEach} from 'vitest';

vi.mock('../../src/service/StreamService.js', () => ({
    default: {
        chatStreamElicitationResponse: vi.fn(),
        handleStreamError: vi.fn(),
    },
}));

vi.mock('../../src/chat/ChatMessage.jsx', () => ({
    AI: 'AI',
    SYSTEM: 'SYSTEM',
}));

import elicitationService from '../../src/service/ElicitationService.js';
import streamService from '../../src/service/StreamService.js';
import {AI, SYSTEM} from '../../src/chat/ChatMessage.jsx';

afterEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// normalizeElicitationSchema
// ---------------------------------------------------------------------------

describe('normalizeElicitationSchema', () => {
    it('returns empty object when input is null', () => {
        expect(elicitationService.normalizeElicitationSchema(null)).toEqual({});
    });

    it('returns schema unchanged when it has no properties key', () => {
        const schema = {title: 'My Schema'};
        expect(elicitationService.normalizeElicitationSchema(schema)).toBe(schema);
    });

    it('returns schema unchanged when properties is non-empty', () => {
        const schema = {properties: {name: {type: 'string'}}};
        expect(elicitationService.normalizeElicitationSchema(schema)).toBe(schema);
    });

    it('replaces empty properties with the default action enum', () => {
        const schema = {title: 'Confirm', properties: {}};
        const result = elicitationService.normalizeElicitationSchema(schema);

        expect(result.title).toBe('Confirm');
        expect(result.properties).toEqual({
            action: {
                type: 'string',
                enum: ['accept', 'cancel', 'decline'],
            },
        });
    });
});

// ---------------------------------------------------------------------------
// handleElicitationChange
// ---------------------------------------------------------------------------

describe('handleElicitationChange', () => {
    it('calls setElicitationValues with an updater that merges the new field', () => {
        const setElicitationValues = vi.fn();

        elicitationService.handleElicitationChange('city', 'London', setElicitationValues);

        expect(setElicitationValues).toHaveBeenCalledTimes(1);
        const updater = setElicitationValues.mock.calls[0][0];
        expect(updater({name: 'Alice', city: 'Paris'})).toEqual({name: 'Alice', city: 'London'});
    });

    it('does not mutate other fields when updating one', () => {
        const setElicitationValues = vi.fn();

        elicitationService.handleElicitationChange('action', 'cancel', setElicitationValues);

        const updater = setElicitationValues.mock.calls[0][0];
        const result = updater({action: 'accept', chatId: 'c-1', extra: 'value'});
        expect(result).toEqual({action: 'cancel', chatId: 'c-1', extra: 'value'});
    });
});

// ---------------------------------------------------------------------------
// handleElicitationSubmit
// ---------------------------------------------------------------------------

function makeSubmitArgs(overrides = {}) {
    return {
        overrideFields: null,
        activeElicitation: {
            message: 'Please confirm',
            elicitationId: 'elicit-1',
            chatId: 'chat-1',
        },
        elicitationValues: {name: 'Alice', chatId: 'chat-1'},
        chatHistory: [
            {type: 'USER', text: 'question', _key: 'u-1'},
            {type: AI, text: 'thinking', _key: 'ai-1', isStreaming: true},
        ],
        setChatHistory: vi.fn(),
        setActiveElicitation: vi.fn(),
        setElicitationSubmitting: vi.fn(),
        setError: vi.fn(),
        handleStreamChunk: vi.fn(),
        ...overrides,
    };
}

describe('handleElicitationSubmit', () => {
    it('returns immediately when activeElicitation is null', async () => {
        const args = makeSubmitArgs({activeElicitation: null});

        await elicitationService.handleElicitationSubmit(args);

        expect(args.setActiveElicitation).not.toHaveBeenCalled();
        expect(args.setChatHistory).not.toHaveBeenCalled();
        expect(streamService.chatStreamElicitationResponse).not.toHaveBeenCalled();
    });

    it('calls setActiveElicitation(null) before streaming', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs();

        await elicitationService.handleElicitationSubmit(args);

        expect(args.setActiveElicitation).toHaveBeenCalledWith(null);
    });

    it('calls setElicitationSubmitting(true) before streaming', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs();

        await elicitationService.handleElicitationSubmit(args);

        const calls = args.setElicitationSubmitting.mock.calls.map(call => call[0]);
        expect(calls[0]).toBe(true);
    });

    it('filters ephemeral messages from chatHistory before updating', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs({
            chatHistory: [
                {type: AI, text: 'Hi', _key: 'ai-ephemeral', ephemeral: true},
                {type: 'USER', text: 'question', _key: 'u-1'},
            ],
        });

        await elicitationService.handleElicitationSubmit(args);

        const newHistory = args.setChatHistory.mock.calls[0][0];
        expect(newHistory.find(message => message._key === 'ai-ephemeral')).toBeUndefined();
    });

    it('appends SYSTEM resolution message and AI placeholder to history', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs({
            chatHistory: [{type: 'USER', text: 'question', _key: 'u-1'}],
            activeElicitation: {message: 'Confirm action', elicitationId: 'e-1', chatId: 'c-1'},
            elicitationValues: {action: 'accept', chatId: 'c-1'},
        });

        await elicitationService.handleElicitationSubmit(args);

        const newHistory = args.setChatHistory.mock.calls[0][0];
        const systemMessage = newHistory.find(message => message.type === SYSTEM);
        const aiPlaceholder = newHistory.find(message => message.type === AI && message.isStreaming);

        expect(systemMessage).toBeDefined();
        expect(systemMessage.text).toBe('Confirm action');
        expect(systemMessage.elicitationResponse).toBe('accept');

        expect(aiPlaceholder).toBeDefined();
        expect(aiPlaceholder.text).toBe('');
    });

    it('excludes chatId from the elicitationResponse summary', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs({
            chatHistory: [],
            elicitationValues: {action: 'accept', name: 'Alice', chatId: 'c-1'},
        });

        await elicitationService.handleElicitationSubmit(args);

        const newHistory = args.setChatHistory.mock.calls[0][0];
        const systemMessage = newHistory.find(message => message.type === SYSTEM);
        expect(systemMessage.elicitationResponse).not.toContain('c-1');
        expect(systemMessage.elicitationResponse).toContain('accept');
        expect(systemMessage.elicitationResponse).toContain('Alice');
    });

    it('merges overrideFields into the payload sent to streamService', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs({
            overrideFields: {action: 'cancel'},
            elicitationValues: {action: 'accept', chatId: 'c-1'},
        });

        await elicitationService.handleElicitationSubmit(args);

        const [payload] = streamService.chatStreamElicitationResponse.mock.calls[0];
        expect(payload.action).toBe('cancel');
    });

    it('calls streamService with elicitationId and chatId from activeElicitation', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs({
            activeElicitation: {message: 'Confirm', elicitationId: 'e-99', chatId: 'c-42'},
            elicitationValues: {chatId: 'c-42'},
        });

        await elicitationService.handleElicitationSubmit(args);

        const [, chatId, elicitationId] = streamService.chatStreamElicitationResponse.mock.calls[0];
        expect(chatId).toBe('c-42');
        expect(elicitationId).toBe('e-99');
    });

    it('calls setElicitationSubmitting(false) after successful stream', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs();

        await elicitationService.handleElicitationSubmit(args);

        const calls = args.setElicitationSubmitting.mock.calls.map(call => call[0]);
        expect(calls.at(-1)).toBe(false);
    });

    it('calls handleStreamError and setElicitationSubmitting(false) on stream error', async () => {
        const streamError = new Error('stream failed');
        streamService.chatStreamElicitationResponse.mockRejectedValue(streamError);
        const args = makeSubmitArgs();

        await elicitationService.handleElicitationSubmit(args);

        expect(streamService.handleStreamError).toHaveBeenCalledWith(
            streamError,
            args.setError,
            args.setChatHistory,
        );
        const calls = args.setElicitationSubmitting.mock.calls.map(call => call[0]);
        expect(calls.at(-1)).toBe(false);
    });
});
