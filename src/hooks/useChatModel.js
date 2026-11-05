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

function useChatModel({chatId, onChatNotFound, currentModel}) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const [options, setOptions] = useState(null);
    const [loadingOptions, setLoadingOptions] = useState(false);
    const [savingModel, setSavingModel] = useState(false);
    const [pickerError, setPickerError] = useState(null);
    const [pendingModel, setPendingModel] = useState(null);
    const [modelNotice, setModelNotice] = useState(null);
    const [trackedChatId, setTrackedChatId] = useState(chatId);
    const [trackedModel, setTrackedModel] = useState(currentModel);
    const [selectedModel, setSelectedModel] = useState(currentModel);
    const [defaultModel, setDefaultModel] = useState(null);

    const chatIdRef = useRef(chatId);
    const requestGenerationRef = useRef(0);

    const chatChanged = trackedChatId !== chatId;

    if (chatChanged) {
        setTrackedChatId(chatId);
        setPickerOpen(false);
        setOptions(null);
        setLoadingOptions(false);
        setSavingModel(false);
        setPickerError(null);
        setPendingModel(null);
        setModelNotice(null);
        setSelectedModel(currentModel);
    }

    if (trackedModel !== currentModel) {
        setTrackedModel(currentModel);
        setSelectedModel(currentModel);

        if (!chatChanged && trackedModel !== undefined && currentModel !== undefined) {
            setOptions((previousOptions) => (previousOptions ? {...previousOptions, selectedModel: currentModel} : previousOptions));
            setModelNotice(currentModel ? `Model set to ${currentModel}.` : 'Using the default model.');
        }
    }

    useEffect(() => {
        chatIdRef.current = chatId;
    }, [chatId]);

    useEffect(() => {
        let active = true;

        chatModelService.options(chatId)
            .then((fetchedOptions) => {
                if (!active || chatIdRef.current !== chatId) {
                    return;
                }

                setDefaultModel(fetchedOptions?.defaultModel ?? null);

                if (chatId) {
                    setSelectedModel(fetchedOptions?.selectedModel ?? null);
                }
            })
            .catch(() => undefined);

        return () => {
            active = false;
        };
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
                setDefaultModel(fetchedOptions?.defaultModel ?? null);

                if (requestChatId) {
                    setSelectedModel(fetchedOptions?.selectedModel ?? null);
                }
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

    const applyToChat = useCallback(async (requestChatId, applyRequest, successNotice, appliedModel) => {
        const generation = requestGenerationRef.current;
        setSavingModel(true);
        setPickerError(null);

        try {
            await applyRequest();

            if (requestChatId === chatIdRef.current) {
                setSelectedModel(appliedModel);
                setModelNotice(successNotice);
                closePicker();
            }

            return true;
        } catch (caughtError) {
            if (!isCurrentRequest(generation, requestChatId)) {
                return false;
            }

            setSavingModel(false);

            if (caughtError?.status === 404) {
                closePicker();
                onChatNotFound?.();
                return false;
            }

            log.error('[useChatModel] Failed to change the chat model:', caughtError);
            const nextPickerError = pickerErrorFor(caughtError);
            setPickerError(nextPickerError);

            if (nextPickerError === PICKER_ERROR_UNKNOWN_MODEL) {
                void loadOptions(requestChatId);
            }

            return false;
        }
    }, [closePicker, isCurrentRequest, loadOptions, onChatNotFound]);

    const refreshOptions = useCallback(() => {
        setPickerError(null);
        void loadOptions(chatIdRef.current);
    }, [loadOptions]);

    const choose = useCallback(async (modelId) => {
        const requestChatId = chatIdRef.current;

        if (!requestChatId) {
            setPendingModel(modelId);
            setModelNotice(`Your first message will use ${modelId}.`);
            closePicker();
            return true;
        }

        return await applyToChat(
            requestChatId,
            () => chatModelService.select(requestChatId, modelId),
            `Model set to ${modelId}.`,
            modelId,
        );
    }, [applyToChat, closePicker]);

    const resetToDefault = useCallback(async () => {
        const requestChatId = chatIdRef.current;
        const defaultModelName = options?.defaultModel ?? defaultModel;

        if (!requestChatId) {
            setPendingModel(null);
            setModelNotice(defaultModelNotice('Your first message will use the default model', defaultModelName));
            closePicker();
            return true;
        }

        return await applyToChat(
            requestChatId,
            () => chatModelService.reset(requestChatId),
            defaultModelNotice('Using the default model', defaultModelName),
            null,
        );
    }, [applyToChat, closePicker, options, defaultModel]);

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

    const displayModel = pendingModel
        ?? (chatId && selectedModel === undefined ? undefined : selectedModel ?? defaultModel ?? undefined);

    return {
        pickerOpen,
        selectedModel,
        defaultModel,
        displayModel,
        refreshOptions,
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
