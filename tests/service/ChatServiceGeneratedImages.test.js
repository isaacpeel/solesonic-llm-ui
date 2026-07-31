import {describe, it, expect, vi, afterEach} from 'vitest';

vi.mock('../../src/client/ApiClient.js', () => ({
    default: {get: vi.fn()},
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {
        chatsUri: 'https://api.example.com/chat',
        streamingChatsUri: 'https://api.example.com/stream',
        imagesUri: 'https://api.example.com/images',
    },
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {getAccessToken: vi.fn(), getUserId: vi.fn()},
}));

import chatService, {DONE, IMAGE, extractGeneratedImages} from '../../src/service/ChatService.js';

function makeHandlers() {
    return {
        activeElicitation: null,
        chatId: 'chat-1',
        appendToLastAIMessage: vi.fn(),
        appendNotificationMessage: vi.fn(),
        ensureChatIdFromResponse: vi.fn(),
        finalizeLastAIMessage: vi.fn(),
        setActiveElicitation: vi.fn(),
        setElicitationSubmitting: vi.fn(),
        setElicitationValues: vi.fn(),
        setError: vi.fn(),
        attachGeneratedImages: vi.fn(),
    };
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('extractGeneratedImages', () => {
    it('reads a generatedImages array', () => {
        const extracted = extractGeneratedImages({
            generatedImages: [{imageId: 'image-1', prompt: 'a lighthouse'}, {imageId: 'image-2'}],
        });

        expect(extracted.map((image) => image.imageId)).toEqual(['image-1', 'image-2']);
    });

    it('reads a bare single reference', () => {
        const extracted = extractGeneratedImages({imageId: 'image-1', seed: 42});

        expect(extracted).toHaveLength(1);
        expect(extracted[0]).toMatchObject({imageId: 'image-1', seed: 42, width: 1024, height: 1024});
    });

    it('drops references carrying no id rather than rendering an empty frame', () => {
        expect(extractGeneratedImages({generatedImages: [{prompt: 'no id here'}]})).toEqual([]);
    });

    it('is empty for an ordinary payload', () => {
        expect(extractGeneratedImages({content: 'just text'})).toEqual([]);
        expect(extractGeneratedImages(null)).toEqual([]);
    });
});

describe('handleStreamChunk generated images', () => {
    it('attaches images from a dedicated image frame', () => {
        const handlers = makeHandlers();

        chatService.handleStreamChunk(
            {event: IMAGE, data: JSON.stringify({imageId: 'image-1', prompt: 'a lighthouse', seed: 42})},
            handlers
        );

        expect(handlers.attachGeneratedImages).toHaveBeenCalledTimes(1);
        expect(handlers.attachGeneratedImages.mock.calls[0][0][0]).toMatchObject({
            imageId: 'image-1',
            prompt: 'a lighthouse',
        });
    });

    it('attaches images riding on the done payload message', () => {
        const handlers = makeHandlers();

        chatService.handleStreamChunk(
            {
                event: DONE,
                data: JSON.stringify({
                    id: 'chat-1',
                    message: {message: 'here it is', generatedImages: [{imageId: 'image-1'}]},
                }),
            },
            handlers
        );

        expect(handlers.attachGeneratedImages).toHaveBeenCalledTimes(1);
        expect(handlers.finalizeLastAIMessage).toHaveBeenCalledTimes(1);
    });

    it('leaves an ordinary done frame alone', () => {
        const handlers = makeHandlers();

        chatService.handleStreamChunk(
            {event: DONE, data: JSON.stringify({id: 'chat-1', message: {message: 'plain text'}})},
            handlers
        );

        expect(handlers.attachGeneratedImages).not.toHaveBeenCalled();
        expect(handlers.finalizeLastAIMessage).toHaveBeenCalledTimes(1);
    });

    it('does not throw when no attach handler is supplied', () => {
        const handlers = makeHandlers();
        delete handlers.attachGeneratedImages;

        expect(() => chatService.handleStreamChunk(
            {event: IMAGE, data: JSON.stringify({imageId: 'image-1'})},
            handlers
        )).not.toThrow();
    });

    it('swallows an unparseable image frame', () => {
        const handlers = makeHandlers();

        expect(() => chatService.handleStreamChunk({event: IMAGE, data: 'not-json'}, handlers)).not.toThrow();
        expect(handlers.attachGeneratedImages).not.toHaveBeenCalled();
    });
});
