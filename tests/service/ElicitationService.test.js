import {describe, it, expect, vi, afterEach} from 'vitest';

vi.mock('../../src/service/StreamService.js', () => ({
    default: {
        chatStreamElicitationResponse: vi.fn(),
        handleStreamError: vi.fn(),
    },
}));

vi.mock('../../src/chat/message/ChatMessage.jsx', () => ({
    AI: 'AI',
    SYSTEM: 'SYSTEM',
}));

import elicitationService, {resolveElicitationAction} from '../../src/service/ElicitationService.js';
import streamService from '../../src/service/StreamService.js';
import {AI, SYSTEM} from '../../src/chat/message/ChatMessage.jsx';

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
        appendErrorMessage: vi.fn(),
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

    it('seeds the AI placeholder with carriedNotifications when provided', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs({
            chatHistory: [{type: 'USER', text: 'question', _key: 'u-1'}],
            elicitationValues: {action: 'accept', chatId: 'c-1'},
            carriedNotifications: ['Resolving project…', 'Checking assignee…'],
        });

        await elicitationService.handleElicitationSubmit(args);

        const newHistory = args.setChatHistory.mock.calls[0][0];
        const aiPlaceholder = newHistory.find(message => message.type === AI && message.isStreaming);
        expect(aiPlaceholder.notifications).toEqual(['Resolving project…', 'Checking assignee…']);
    });

    it('seeds the AI placeholder with an empty notifications array when none are carried', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs({
            chatHistory: [{type: 'USER', text: 'question', _key: 'u-1'}],
            elicitationValues: {action: 'accept', chatId: 'c-1'},
        });

        await elicitationService.handleElicitationSubmit(args);

        const newHistory = args.setChatHistory.mock.calls[0][0];
        const aiPlaceholder = newHistory.find(message => message.type === AI && message.isStreaming);
        expect(aiPlaceholder.notifications).toEqual([]);
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

    it('resolves a oneOf value to its title, not the raw const, in the summary', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs({
            activeElicitation: {
                message: 'Who should this story be assigned to?',
                elicitationId: 'e-1',
                chatId: 'c-1',
                requestedSchema: {
                    properties: {
                        assignee: {
                            type: 'string',
                            title: 'Assignee',
                            oneOf: [
                                {const: '70121:ad77bd3b-88c0-4373-ab9d-db11b7b9dae9', title: 'Evan Baron'},
                                {const: '5f2a-user-isaac', title: 'isaac'},
                            ],
                        },
                    },
                },
            },
            elicitationValues: {assignee: '70121:ad77bd3b-88c0-4373-ab9d-db11b7b9dae9', chatId: 'c-1'},
        });

        await elicitationService.handleElicitationSubmit(args);

        const newHistory = args.setChatHistory.mock.calls[0][0];
        const systemMessage = newHistory.find(message => message.type === SYSTEM);
        expect(systemMessage.elicitationResponse).toBe('Evan Baron');
        expect(systemMessage.elicitationResponse).not.toContain('70121');
    });

    it('resolves an enum value to its title-cased label in the summary', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs({
            activeElicitation: {
                message: 'Which environment should this deploy target?',
                elicitationId: 'e-2',
                chatId: 'c-1',
                requestedSchema: {
                    properties: {
                        environment: {type: 'string', title: 'Environment', enum: ['staging', 'production']},
                    },
                },
            },
            elicitationValues: {environment: 'staging', chatId: 'c-1'},
        });

        await elicitationService.handleElicitationSubmit(args);

        const newHistory = args.setChatHistory.mock.calls[0][0];
        const systemMessage = newHistory.find(message => message.type === SYSTEM);
        expect(systemMessage.elicitationResponse).toBe('Staging');
    });

    it('falls back to the raw value for a free-text field with no enum/oneOf', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs({
            activeElicitation: {
                message: 'What should the title be?',
                elicitationId: 'e-3',
                chatId: 'c-1',
                requestedSchema: {
                    properties: {
                        title: {type: 'string', title: 'Title'},
                    },
                },
            },
            elicitationValues: {title: 'this is a test, delete later', chatId: 'c-1'},
        });

        await elicitationService.handleElicitationSubmit(args);

        const newHistory = args.setChatHistory.mock.calls[0][0];
        const systemMessage = newHistory.find(message => message.type === SYSTEM);
        expect(systemMessage.elicitationResponse).toBe('this is a test, delete later');
    });

    it('resolves each item of a multi-select array to its label', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs({
            activeElicitation: {
                message: 'Which labels?',
                elicitationId: 'e-4',
                chatId: 'c-1',
                requestedSchema: {
                    properties: {
                        labels: {
                            type: 'array',
                            title: 'Labels',
                            items: {
                                anyOf: [
                                    {const: 'lbl-bug', title: 'Bug'},
                                    {const: 'lbl-chore', title: 'Chore'},
                                ],
                            },
                        },
                    },
                },
            },
            elicitationValues: {labels: ['lbl-bug', 'lbl-chore'], chatId: 'c-1'},
        });

        await elicitationService.handleElicitationSubmit(args);

        const newHistory = args.setChatHistory.mock.calls[0][0];
        const systemMessage = newHistory.find(message => message.type === SYSTEM);
        expect(systemMessage.elicitationResponse).toBe('Bug, Chore');
    });

    it('resolves the label for a direct (no properties) enum schema', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs({
            activeElicitation: {
                message: 'Pick one',
                elicitationId: 'e-5',
                chatId: 'c-1',
                requestedSchema: {
                    type: 'string',
                    enum: ['red', 'blue'],
                },
            },
            elicitationValues: {value: 'blue', chatId: 'c-1'},
        });

        await elicitationService.handleElicitationSubmit(args);

        const newHistory = args.setChatHistory.mock.calls[0][0];
        const systemMessage = newHistory.find(message => message.type === SYSTEM);
        expect(systemMessage.elicitationResponse).toBe('Blue');
    });

    it('merges overrideFields into the answer sent to streamService', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs({
            overrideFields: {action: 'cancel'},
            elicitationValues: {action: 'accept', chatId: 'c-1'},
        });

        await elicitationService.handleElicitationSubmit(args);

        const [toolMessage] = streamService.chatStreamElicitationResponse.mock.calls[0];
        expect(JSON.parse(toolMessage.content).action).toBe('cancel');
    });

    it('answers with an AG-UI ToolMessage for the elicitation tool call', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs({
            activeElicitation: {message: 'Confirm', elicitationId: 'e-99', chatId: 'c-42'},
            elicitationValues: {action: 'accept'},
        });

        await elicitationService.handleElicitationSubmit(args);

        const [toolMessage] = streamService.chatStreamElicitationResponse.mock.calls[0];
        expect(toolMessage.role).toBe('tool');
        expect(toolMessage.toolCallId).toBe('e-99');
        expect(typeof toolMessage.id).toBe('string');
        expect(toolMessage.id.length).toBeGreaterThan(0);
        expect(typeof toolMessage.content).toBe('string');
        expect(JSON.parse(toolMessage.content)).toEqual({action: 'accept'});
        expect(toolMessage).not.toHaveProperty('elicitationId');
    });

    /* randomUUID exists only in secure contexts; a plain-http deployment must still answer. */
    it('still answers when crypto.randomUUID is unavailable', async () => {
        vi.stubGlobal('crypto', {});
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs({elicitationValues: {action: 'accept'}});

        try {
            await elicitationService.handleElicitationSubmit(args);
        } finally {
            vi.unstubAllGlobals();
        }

        const [toolMessage] = streamService.chatStreamElicitationResponse.mock.calls[0];
        expect(typeof toolMessage.id).toBe('string');
        expect(toolMessage.id.length).toBeGreaterThan(0);
        expect(streamService.handleStreamError).not.toHaveBeenCalled();
    });

    it('keeps the submitted form fields in the content alongside the action', async () => {
        streamService.chatStreamElicitationResponse.mockResolvedValue(undefined);
        const args = makeSubmitArgs({elicitationValues: {projectKey: 'PROJ', summary: 'Add dark mode'}});

        await elicitationService.handleElicitationSubmit(args);

        const [toolMessage] = streamService.chatStreamElicitationResponse.mock.calls[0];
        expect(JSON.parse(toolMessage.content)).toEqual({
            projectKey: 'PROJ',
            summary: 'Add dark mode',
            action: 'accept',
        });
    });
});

describe('resolveElicitationAction', () => {
    it('uses an explicit action field, case-insensitively', () => {
        expect(resolveElicitationAction({action: 'DECLINE'})).toBe('decline');
        expect(resolveElicitationAction({action: 'cancel', chatId: 'c-1'})).toBe('cancel');
    });

    it('maps a single choice field that is not named action', () => {
        expect(resolveElicitationAction({confirm: 'accept', chatId: 'c-1'})).toBe('accept');
        expect(resolveElicitationAction({confirm: 'no'})).toBe('decline');
        expect(resolveElicitationAction({answer: 'Yes'})).toBe('accept');
        expect(resolveElicitationAction({answer: 'cancel'})).toBe('cancel');
    });

    it('treats a submitted form as an accept', () => {
        expect(resolveElicitationAction({projectKey: 'PROJ', summary: 'no'})).toBe('accept');
        expect(resolveElicitationAction({choice: 'option-b'})).toBe('accept');
        expect(resolveElicitationAction({})).toBe('accept');
    });

    it('does not mistake an object-prototype key for an action', () => {
        expect(resolveElicitationAction({answer: 'constructor'})).toBe('accept');
    });
});

describe('handleElicitationSubmit stream outcome', () => {

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
            args.appendErrorMessage,
            args.setChatHistory,
        );
        const calls = args.setElicitationSubmitting.mock.calls.map(call => call[0]);
        expect(calls.at(-1)).toBe(false);
    });
});
