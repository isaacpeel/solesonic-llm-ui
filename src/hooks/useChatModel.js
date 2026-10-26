import {useCallback, useEffect, useRef, useState} from 'react';
import log from 'loglevel';
import chatModelService, {MODEL_LIST_UNAVAILABLE_CODE, UNKNOWN_MODEL_CODE} from '../service/ChatModelService.js';
import {LLM_KEY_MISSING_CODE} from '../service/LlmKeyService.js';

export const PICKER_ERROR_UNAVAILABLE = 'unavailable';
export const PICKER_ERROR_UNKNOWN_MODEL = 'unknown';
export const PICKER_ERROR_FAILED = 'failed';
export const PICKER_ERROR_NO_ACCESS = 'no-access';

function pickerErrorFor(caughtError) {
    if (caughtError?.code === LLM_KEY_MISSING_CODE) {
        return PICKER_ERROR_NO_ACCESS;
    }

    if (caughtError?.code === UNKNOWN_MODEL_CODE) {
        return PICKER_ERROR_UNKNOWN_MODEL;
    }

    if (caughtError?.code === MODEL_LIST_UNAVAILABLE_CODE || caughtError?.status === 503) {
        return PICKER_ERROR_UNAVAILABLE;
    }

    return PICKER_ERROR_FAILED;
}

function defaultModelNotice(prefix, defaultModel) {
    return defaultModel ? `${prefix}, ${defaultModel}.` : `${prefix}.`;
}

function useChatModel({chatId, onChatNotFound}) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const [options, setOptions] = useState(null);
    const [loadingOptions, setLoadingOptions] = useState(false);
    const [savingModel, setSavingModel] = useState(false);
    const [pickerError, setPickerError] = useState(null);
    const [pendingModel, setPendingModel] = useState(null);
    const [modelNotice, setModelNotice] = useState(null);
    const [trackedChatId, setTrackedChatId] = useState(chatId);

    const chatIdRef = useRef(chatId);
    const requestGenerationRef = useRef(0);

    if (trackedChatId !== chatId) {
        setTrackedChatId(chatId);
        setPickerOpen(false);
        setOptions(null);
        setLoadingOptions(false);
        setSavingModel(false);
        setPickerError(null);
        setPendingModel(null);
        setModelNotice(null);
    }

    useEffect(() => {
        chatIdRef.current = chatId;
    }, [chatId]);

    const isCurrentRequest = useCallback((generation, requestChatId) => {
        return generation === requestGenerationRef.current && requestChatId === chatIdRef.current;
    }, []);

    const closePicker = useCallback(() => {
        requestGenerationRef.current += 1;
        setPickerOpen(false);
        setPickerError(null);
        setLoadingOptions(false);
        setSavingModel(false);
    }, []);

    const loadOptions = useCallback(async (requestChatId) => {
        requestGenerationRef.current += 1;
        const generation = requestGenerationRef.current;
        setLoadingOptions(true);

        try {
            const fetchedOptions = await chatModelService.options(requestChatId);

            if (isCurrentRequest(generation, requestChatId)) {
                setOptions(fetchedOptions);
            }
        } catch (caughtError) {
            if (!isCurrentRequest(generation, requestChatId)) {
                return;
            }

            setOptions(null);

            if (caughtError?.status === 404) {
                closePicker();
                onChatNotFound?.();
                return;
            }

            log.error('[useChatModel] Failed to load the model list:', caughtError);
            setPickerError(pickerErrorFor(caughtError));
        } finally {
            if (isCurrentRequest(generation, requestChatId)) {
                setLoadingOptions(false);
            }
        }
    }, [closePicker, isCurrentRequest, onChatNotFound]);

    const openPicker = useCallback(() => {
        setPickerOpen(true);
        setPickerError(null);
        setOptions(null);
        void loadOptions(chatIdRef.current);
    }, [loadOptions]);

    const applyToChat = useCallback(async (requestChatId, applyRequest, successNotice) => {
        const generation = requestGenerationRef.current;
        setSavingModel(true);
        setPickerError(null);

        try {
            await applyRequest();

            if (requestChatId === chatIdRef.current) {
                setModelNotice(successNotice);
                closePicker();
            }
        } catch (caughtError) {
            if (!isCurrentRequest(generation, requestChatId)) {
                return;
            }

            setSavingModel(false);

            if (caughtError?.status === 404) {
                closePicker();
                onChatNotFound?.();
                return;
            }

            log.error('[useChatModel] Failed to change the chat model:', caughtError);
            const nextPickerError = pickerErrorFor(caughtError);
            setPickerError(nextPickerError);

            if (nextPickerError === PICKER_ERROR_UNKNOWN_MODEL) {
                void loadOptions(requestChatId);
            }
        }
    }, [closePicker, isCurrentRequest, loadOptions, onChatNotFound]);

    const choose = useCallback(async (modelId) => {
        const requestChatId = chatIdRef.current;

        if (!requestChatId) {
            setPendingModel(modelId);
            setModelNotice(`Your first message will use ${modelId}.`);
            closePicker();
            return;
        }

        await applyToChat(
            requestChatId,
            () => chatModelService.select(requestChatId, modelId),
            `Model set to ${modelId}.`,
        );
    }, [applyToChat, closePicker]);

    const resetToDefault = useCallback(async () => {
        const requestChatId = chatIdRef.current;
        const defaultModel = options?.defaultModel;

        if (!requestChatId) {
            setPendingModel(null);
            setModelNotice(defaultModelNotice('Your first message will use the default model', defaultModel));
            closePicker();
            return;
        }

        await applyToChat(
            requestChatId,
            () => chatModelService.reset(requestChatId),
            defaultModelNotice('Using the default model', defaultModel),
        );
    }, [applyToChat, closePicker, options]);

    const rejectPendingModel = useCallback(() => {
        setPendingModel(null);
        setModelNotice(null);
        setPickerOpen(true);
        setOptions(null);
        setPickerError(PICKER_ERROR_UNKNOWN_MODEL);
        void loadOptions(chatIdRef.current);
    }, [loadOptions]);

    const clearModelNotice = useCallback(() => {
        setModelNotice(null);
    }, []);

    return {
        pickerOpen,
        options,
        loadingOptions,
        savingModel,
        pickerError,
        pendingModel,
        modelNotice,
        openPicker,
        closePicker,
        choose,
        resetToDefault,
        rejectPendingModel,
        clearModelNotice,
    };
}

export default useChatModel;
