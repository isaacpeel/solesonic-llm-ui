import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act, waitFor} from '@testing-library/react';

vi.mock('../../src/service/ChatModelService.js', async (importOriginal) => ({
    ...(await importOriginal()),
    default: {
        options: vi.fn(),
        select: vi.fn(),
        reset: vi.fn(),
    },
}));

import chatModelService from '../../src/service/ChatModelService.js';
import useChatModel, {
    PICKER_ERROR_FAILED,
    PICKER_ERROR_NO_ACCESS,
    PICKER_ERROR_UNAVAILABLE,
    PICKER_ERROR_UNKNOWN_MODEL,
} from '../../src/hooks/useChatModel.js';
import {ApiError} from '../../src/client/ApiClient.js';

const modelOptions = {
    models: [
        {id: 'qwen3-8b', ownedBy: 'local'},
        {id: 'openai/gpt-4o', ownedBy: 'openai'},
        {id: 'mistral-small', ownedBy: null},
    ],
    defaultModel: 'qwen3-8b',
    selectedModel: null,
    activeAgent: null,
};

function apiError(status, code) {
    return new ApiError({message: `${status}`, status, method: 'PUT', uri: '/chats/chat-1/model', code});
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });

    return {promise, resolve, reject};
}

function renderChatModel(initialProps = {chatId: 'chat-1'}) {
    const onChatNotFound = vi.fn();
    const rendered = renderHook(
        (props) => useChatModel({onChatNotFound, ...props}),
        {initialProps},
    );

    return {onChatNotFound, ...rendered};
}

async function openLoadedPicker(result) {
    await act(async () => {
        result.current.openPicker();
    });

    await waitFor(() => expect(result.current.loadingOptions).toBe(false));
}

describe('useChatModel opening the picker', () => {
    beforeEach(() => {
        chatModelService.options.mockResolvedValue(modelOptions);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it('starts closed, with nothing pending', () => {
        const {result} = renderChatModel();

        expect(result.current.pickerOpen).toBe(false);
        expect(result.current.pendingModel).toBeNull();
        expect(result.current.modelNotice).toBeNull();
        expect(chatModelService.options).not.toHaveBeenCalled();
    });

    it('opens loading, then holds the options fetched for the chat', async () => {
        const pendingOptions = deferred();
        chatModelService.options.mockReturnValue(pendingOptions.promise);
        const {result} = renderChatModel();

        act(() => {
            result.current.openPicker();
        });

        expect(result.current.pickerOpen).toBe(true);
        expect(result.current.loadingOptions).toBe(true);
        expect(chatModelService.options).toHaveBeenCalledWith('chat-1');

        await act(async () => {
            pendingOptions.resolve(modelOptions);
        });

        expect(result.current.loadingOptions).toBe(false);
        expect(result.current.options).toEqual(modelOptions);
        expect(result.current.pickerError).toBeNull();
    });

    it('asks without a chat id for a new chat', async () => {
        const {result} = renderChatModel({chatId: null});

        await openLoadedPicker(result);

        expect(chatModelService.options).toHaveBeenCalledWith(null);
    });

    it('reports the list as unavailable when it cannot be loaded', async () => {
        chatModelService.options.mockRejectedValue(apiError(503, 'MODEL_LIST_UNAVAILABLE'));
        const {result} = renderChatModel();

        await openLoadedPicker(result);

        expect(result.current.pickerOpen).toBe(true);
        expect(result.current.pickerError).toBe(PICKER_ERROR_UNAVAILABLE);
        expect(result.current.options).toBeNull();
    });

    it('reports a missing model key as no access', async () => {
        chatModelService.options.mockRejectedValue(apiError(403, 'LLM_KEY_MISSING'));
        const {result} = renderChatModel();

        await openLoadedPicker(result);

        expect(result.current.pickerOpen).toBe(true);
        expect(result.current.pickerError).toBe(PICKER_ERROR_NO_ACCESS);
        expect(result.current.options).toBeNull();
    });

    it('reports any other options failure as failed', async () => {
        chatModelService.options.mockRejectedValue(apiError(500));
        const {result} = renderChatModel();

        await openLoadedPicker(result);

        expect(result.current.pickerOpen).toBe(true);
        expect(result.current.pickerError).toBe(PICKER_ERROR_FAILED);
        expect(result.current.options).toBeNull();
    });

    it('closes and reports a not-found chat when the options call fails 404', async () => {
        chatModelService.options.mockRejectedValue(apiError(404));
        const {result, onChatNotFound} = renderChatModel();

        await openLoadedPicker(result);

        expect(onChatNotFound).toHaveBeenCalledTimes(1);
        expect(result.current.pickerOpen).toBe(false);
        expect(result.current.pickerError).toBeNull();
        expect(result.current.loadingOptions).toBe(false);
    });

    it('ignores a 404 for a chat the user has already left', async () => {
        const pendingOptions = deferred();
        chatModelService.options.mockReturnValue(pendingOptions.promise);
        const {result, rerender, onChatNotFound} = renderChatModel();

        act(() => {
            result.current.openPicker();
        });

        rerender({chatId: 'chat-2'});

        await act(async () => {
            pendingOptions.reject(apiError(404));
        });

        expect(onChatNotFound).not.toHaveBeenCalled();
        expect(result.current.pickerOpen).toBe(false);
        expect(result.current.pickerError).toBeNull();
    });

    it('ignores options that arrive after the picker was closed', async () => {
        const pendingOptions = deferred();
        chatModelService.options.mockReturnValue(pendingOptions.promise);
        const {result} = renderChatModel();

        act(() => {
            result.current.openPicker();
        });

        act(() => {
            result.current.closePicker();
        });

        await act(async () => {
            pendingOptions.resolve(modelOptions);
        });

        expect(result.current.pickerOpen).toBe(false);
        expect(result.current.options).toBeNull();
        expect(result.current.loadingOptions).toBe(false);
    });

    it('ignores a failure that arrives after the picker was closed', async () => {
        const pendingOptions = deferred();
        chatModelService.options.mockReturnValue(pendingOptions.promise);
        const {result} = renderChatModel();

        act(() => {
            result.current.openPicker();
        });

        act(() => {
            result.current.closePicker();
        });

        await act(async () => {
            pendingOptions.reject(apiError(503, 'MODEL_LIST_UNAVAILABLE'));
        });

        expect(result.current.pickerError).toBeNull();
    });
});

describe('useChatModel choosing for an existing chat', () => {
    beforeEach(() => {
        chatModelService.options.mockResolvedValue(modelOptions);
        chatModelService.select.mockResolvedValue({defaultModel: 'qwen3-8b', selectedModel: 'openai/gpt-4o', activeAgent: null});
        chatModelService.reset.mockResolvedValue(null);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it('applies the pick to the chat, closes, and confirms', async () => {
        const {result} = renderChatModel();
        await openLoadedPicker(result);

        await act(async () => {
            await result.current.choose('openai/gpt-4o');
        });

        expect(chatModelService.select).toHaveBeenCalledWith('chat-1', 'openai/gpt-4o');
        expect(result.current.pickerOpen).toBe(false);
        expect(result.current.modelNotice).toBe('Model set to openai/gpt-4o.');
        expect(result.current.pendingModel).toBeNull();
    });

    it('keeps the picker open and re-fetches when the model is no longer offered', async () => {
        chatModelService.select.mockRejectedValue(apiError(400, 'UNKNOWN_MODEL'));
        const {result} = renderChatModel();
        await openLoadedPicker(result);

        await act(async () => {
            await result.current.choose('gone-model');
        });

        expect(result.current.pickerOpen).toBe(true);
        expect(result.current.pickerError).toBe(PICKER_ERROR_UNKNOWN_MODEL);
        expect(chatModelService.options).toHaveBeenCalledTimes(2);
        expect(result.current.modelNotice).toBeNull();
    });

    it('reports the list as unavailable when the server cannot check the pick', async () => {
        chatModelService.select.mockRejectedValue(apiError(503, 'MODEL_LIST_UNAVAILABLE'));
        const {result} = renderChatModel();
        await openLoadedPicker(result);

        await act(async () => {
            await result.current.choose('openai/gpt-4o');
        });

        expect(result.current.pickerOpen).toBe(true);
        expect(result.current.pickerError).toBe(PICKER_ERROR_UNAVAILABLE);
    });

    it('reports any other failure without closing', async () => {
        chatModelService.select.mockRejectedValue(apiError(500));
        const {result} = renderChatModel();
        await openLoadedPicker(result);

        await act(async () => {
            await result.current.choose('openai/gpt-4o');
        });

        expect(result.current.pickerOpen).toBe(true);
        expect(result.current.pickerError).toBe(PICKER_ERROR_FAILED);
    });

    it('treats a missing chat like every other not-found chat', async () => {
        chatModelService.select.mockRejectedValue(apiError(404));
        const {result, onChatNotFound} = renderChatModel();
        await openLoadedPicker(result);

        await act(async () => {
            await result.current.choose('openai/gpt-4o');
        });

        expect(onChatNotFound).toHaveBeenCalledTimes(1);
        expect(result.current.pickerOpen).toBe(false);
    });

    it('resets the chat to the default and names it', async () => {
        const {result} = renderChatModel();
        await openLoadedPicker(result);

        await act(async () => {
            await result.current.resetToDefault();
        });

        expect(chatModelService.reset).toHaveBeenCalledWith('chat-1');
        expect(result.current.pickerOpen).toBe(false);
        expect(result.current.modelNotice).toBe('Using the default model, qwen3-8b.');
    });

    it('drops a confirmation for a chat the user has already left', async () => {
        const pendingSelect = deferred();
        chatModelService.select.mockReturnValue(pendingSelect.promise);
        const {result, rerender} = renderChatModel();
        await openLoadedPicker(result);

        let choosePromise;
        act(() => {
            choosePromise = result.current.choose('openai/gpt-4o');
        });

        rerender({chatId: 'chat-2'});

        await act(async () => {
            pendingSelect.resolve({});
            await choosePromise;
        });

        expect(result.current.modelNotice).toBeNull();
        expect(result.current.pickerOpen).toBe(false);
    });
});

describe('useChatModel choosing for a new chat', () => {
    beforeEach(() => {
        chatModelService.options.mockResolvedValue(modelOptions);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('holds the pick locally for the first message', async () => {
        const {result} = renderChatModel({chatId: null});
        await openLoadedPicker(result);

        await act(async () => {
            await result.current.choose('openai/gpt-4o');
        });

        expect(chatModelService.select).not.toHaveBeenCalled();
        expect(result.current.pendingModel).toBe('openai/gpt-4o');
        expect(result.current.pickerOpen).toBe(false);
        expect(result.current.modelNotice).toBe('Your first message will use openai/gpt-4o.');
    });

    it('clears the pending pick when the default is chosen', async () => {
        const {result} = renderChatModel({chatId: null});
        await openLoadedPicker(result);

        await act(async () => {
            await result.current.choose('openai/gpt-4o');
        });

        await openLoadedPicker(result);

        await act(async () => {
            await result.current.resetToDefault();
        });

        expect(chatModelService.reset).not.toHaveBeenCalled();
        expect(result.current.pendingModel).toBeNull();
        expect(result.current.modelNotice).toBe('Your first message will use the default model, qwen3-8b.');
    });

    it('drops the pending pick and reopens on the unknown-model error when the send rejects it', async () => {
        const {result} = renderChatModel({chatId: null});
        await openLoadedPicker(result);

        await act(async () => {
            await result.current.choose('gone-model');
        });

        await act(async () => {
            result.current.rejectPendingModel();
        });

        await waitFor(() => expect(result.current.loadingOptions).toBe(false));

        expect(result.current.pendingModel).toBeNull();
        expect(result.current.pickerOpen).toBe(true);
        expect(result.current.pickerError).toBe(PICKER_ERROR_UNKNOWN_MODEL);
        expect(result.current.options).toEqual(modelOptions);
    });

    it('clears the notice on request', async () => {
        const {result} = renderChatModel({chatId: null});
        await openLoadedPicker(result);

        await act(async () => {
            await result.current.choose('openai/gpt-4o');
        });

        act(() => {
            result.current.clearModelNotice();
        });

        expect(result.current.modelNotice).toBeNull();
        expect(result.current.pendingModel).toBe('openai/gpt-4o');
    });
});

describe('useChatModel on a chat change', () => {
    beforeEach(() => {
        chatModelService.options.mockResolvedValue(modelOptions);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('closes the picker and drops a pending pick and its notice', async () => {
        const {result, rerender} = renderChatModel({chatId: null});
        await openLoadedPicker(result);

        await act(async () => {
            await result.current.choose('openai/gpt-4o');
        });

        await openLoadedPicker(result);

        rerender({chatId: 'chat-2'});

        expect(result.current.pickerOpen).toBe(false);
        expect(result.current.pendingModel).toBeNull();
        expect(result.current.modelNotice).toBeNull();
    });

    it('ignores options for the chat that was left', async () => {
        const pendingOptions = deferred();
        chatModelService.options.mockReturnValue(pendingOptions.promise);
        const {result, rerender} = renderChatModel({chatId: 'chat-1'});

        act(() => {
            result.current.openPicker();
        });

        rerender({chatId: 'chat-2'});

        await act(async () => {
            pendingOptions.resolve(modelOptions);
        });

        expect(result.current.options).toBeNull();
        expect(result.current.pickerOpen).toBe(false);
    });
});
