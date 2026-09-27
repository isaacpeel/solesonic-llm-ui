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

import chatService, {
    CUSTOM,
    CUSTOM_IMAGE,
    RUN_FINISHED,
    extractGeneratedImages,
} from '../../src/service/ChatService.js';

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

function imageFrame(value) {
    return {event: CUSTOM, data: JSON.stringify({type: CUSTOM, name: CUSTOM_IMAGE, value})};
}

function runFinishedFrame(result) {
    return {event: RUN_FINISHED, data: JSON.stringify({type: RUN_FINISHED, threadId: 'chat-1', runId: 'run-1', result})};
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
    it('attaches the GeneratedImageSummary carried by a CUSTOM image frame', () => {
        const handlers = makeHandlers();

        chatService.handleStreamChunk(imageFrame({
            imageId: 'image-1',
            chatMessageId: null,
            imageUrl: '/izzybot/images/image-1',
            prompt: 'a small red lighthouse',
            model: 'FLUX.1-schnell',
            seed: 42,
            width: 1024,
            height: 1024,
            steps: 4,
            elapsedSeconds: 6.1,
            fileSizeBytes: 1502931,
            created: '2026-07-31T16:40:14Z',
        }), handlers);

        expect(handlers.attachGeneratedImages).toHaveBeenCalledTimes(1);
        expect(handlers.attachGeneratedImages.mock.calls[0][0][0]).toMatchObject({
            imageId: 'image-1',
            imageUrl: '/izzybot/images/image-1',
            prompt: 'a small red lighthouse',
            seed: 42,
        });
    });

    it('attaches images repeated on the RUN_FINISHED result message', () => {
        const handlers = makeHandlers();

        chatService.handleStreamChunk(runFinishedFrame({
            id: 'chat-1',
            message: {message: 'here it is', generatedImages: [{imageId: 'image-1'}]},
        }), handlers);

        expect(handlers.attachGeneratedImages).toHaveBeenCalledTimes(1);
        expect(handlers.finalizeLastAIMessage).toHaveBeenCalledTimes(1);
    });

    it('leaves an ordinary RUN_FINISHED alone', () => {
        const handlers = makeHandlers();

        chatService.handleStreamChunk(runFinishedFrame({id: 'chat-1', message: {message: 'plain text'}}), handlers);

        expect(handlers.attachGeneratedImages).not.toHaveBeenCalled();
        expect(handlers.finalizeLastAIMessage).toHaveBeenCalledTimes(1);
    });

    it('does not throw when no attach handler is supplied', () => {
        const handlers = makeHandlers();
        delete handlers.attachGeneratedImages;

        expect(() => chatService.handleStreamChunk(imageFrame({imageId: 'image-1'}), handlers)).not.toThrow();
    });

    it('swallows an unparseable CUSTOM frame', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const handlers = makeHandlers();

        expect(() => chatService.handleStreamChunk({event: CUSTOM, data: 'not-json'}, handlers)).not.toThrow();
        expect(handlers.attachGeneratedImages).not.toHaveBeenCalled();
        consoleError.mockRestore();
    });
});
