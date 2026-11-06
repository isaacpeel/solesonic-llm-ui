import {useState} from 'react';
import PropTypes from 'prop-types';
import ModelSelect from './ModelSelect.jsx';
import {
    PICKER_ERROR_FAILED,
    PICKER_ERROR_NO_ACCESS,
    PICKER_ERROR_UNAVAILABLE,
    PICKER_ERROR_UNKNOWN_MODEL,
} from '../../hooks/useChatModel.js';

const SAMPLE_MODELS = [
    {id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', displayName: 'Claude 3.5 Sonnet'},
    {id: 'openai.gpt-4o', displayName: 'GPT-4o'},
    {id: 'anthropic.claude-3-haiku-20240307-v1:0', displayName: 'Claude 3 Haiku'},
    {id: 'google.gemini-1-5-pro', displayName: 'Gemini 1.5 Pro'},
    {id: 'meta.llama3-70b-instruct-v1:0', displayName: 'Llama 3 70B'},
    {id: 'mistral.mistral-large-2407', displayName: 'Mistral Large'},
];

function createMockChatModel({
    models = SAMPLE_MODELS,
    defaultModel = 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    selectedModel = 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    pendingModel = null,
    loadingOptions = false,
    savingModel = false,
    pickerError = null,
    onChoose = async () => true,
    onRefresh = () => {},
} = {}) {
    const selectedOrPending = pendingModel ?? selectedModel ?? defaultModel;
    const currentModelObj = models?.find((m) => m.id.toLowerCase() === selectedOrPending?.toLowerCase());
    const displayLabel = currentModelObj?.displayName || selectedOrPending || 'Default model';

    return {
        options: models ? {models, defaultModel, selectedModel} : null,
        defaultModel,
        selectedModel,
        pendingModel,
        displayModel: selectedOrPending,
        displayLabel,
        loadingOptions,
        savingModel,
        pickerError,
        labelFor: (id) => models?.find((m) => m.id.toLowerCase() === id?.toLowerCase())?.displayName || id,
        refreshOptions: onRefresh,
        choose: onChoose,
    };
}

function InteractiveModelSelect({initialSelected = 'anthropic.claude-3-5-sonnet-20241022-v2:0', models = SAMPLE_MODELS}) {
    const [selected, setSelected] = useState(initialSelected);
    const [saving, setSaving] = useState(false);

    const chatModel = createMockChatModel({
        models,
        selectedModel: selected,
        savingModel: saving,
        onChoose: async (id) => {
            setSaving(true);
            await new Promise((resolve) => setTimeout(resolve, 300));
            setSelected(id);
            setSaving(false);
            return true;
        },
    });

    return <ModelSelect chatModel={chatModel}/>;
}

InteractiveModelSelect.propTypes = {
    initialSelected: PropTypes.string,
    models: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        displayName: PropTypes.string,
    })),
};

export default {
    title: 'Chat/Header/ModelSelect',
    component: ModelSelect,
    decorators: [
        (Story) => (
            <div style={{minHeight: 340, padding: 24, display: 'flex', justifyContent: 'flex-end'}}>
                <Story/>
            </div>
        ),
    ],
};

export const Default = {
    args: {
        chatModel: createMockChatModel(),
    },
};

export const OpenDropdown = {
    args: {
        chatModel: createMockChatModel(),
    },
    play: async ({canvasElement}) => {
        const button = canvasElement.querySelector('.model-select-button');
        button?.click();
    },
};

export const Interactive = {
    render: () => <InteractiveModelSelect/>,
};

export const Saving = {
    args: {
        chatModel: createMockChatModel({
            savingModel: true,
        }),
    },
    play: async ({canvasElement}) => {
        const button = canvasElement.querySelector('.model-select-button');
        button?.click();
    },
};

export const LoadingOptions = {
    args: {
        chatModel: createMockChatModel({
            models: null,
            loadingOptions: true,
        }),
    },
    play: async ({canvasElement}) => {
        const button = canvasElement.querySelector('.model-select-button');
        button?.click();
    },
};

export const ErrorUnavailable = {
    args: {
        chatModel: createMockChatModel({
            pickerError: PICKER_ERROR_UNAVAILABLE,
        }),
    },
    play: async ({canvasElement}) => {
        const button = canvasElement.querySelector('.model-select-button');
        button?.click();
    },
};

export const ErrorNoAccess = {
    args: {
        chatModel: createMockChatModel({
            pickerError: PICKER_ERROR_NO_ACCESS,
        }),
    },
    play: async ({canvasElement}) => {
        const button = canvasElement.querySelector('.model-select-button');
        button?.click();
    },
};

export const ErrorUnknownModel = {
    args: {
        chatModel: createMockChatModel({
            pickerError: PICKER_ERROR_UNKNOWN_MODEL,
        }),
    },
    play: async ({canvasElement}) => {
        const button = canvasElement.querySelector('.model-select-button');
        button?.click();
    },
};

export const ErrorFailed = {
    args: {
        chatModel: createMockChatModel({
            pickerError: PICKER_ERROR_FAILED,
        }),
    },
    play: async ({canvasElement}) => {
        const button = canvasElement.querySelector('.model-select-button');
        button?.click();
    },
};

export const FallbackLabel = {
    args: {
        chatModel: {
            options: null,
            defaultModel: null,
            selectedModel: null,
            pendingModel: null,
            displayModel: undefined,
            displayLabel: undefined,
            loadingOptions: false,
            savingModel: false,
            pickerError: null,
            labelFor: () => undefined,
            refreshOptions: () => {},
            choose: async () => true,
        },
        fallbackLabel: 'Claude 3.5 Sonnet (default)',
    },
};

export const LongModelNames = {
    render: () => (
        <InteractiveModelSelect
            initialSelected="us.anthropic.claude-3-5-sonnet-20241022-v2:0-extended-thinking-preview"
            models={[
                {
                    id: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0-extended-thinking-preview',
                    displayName: 'Anthropic Claude 3.5 Sonnet Enterprise Edition v2 with Extended Thinking',
                },
                {
                    id: 'meta.llama-3-3-70b-instruct-quantized-gpu-cluster-production-v1',
                    displayName: 'Meta Llama 3.3 70B Instruct Supercharged High-Throughput Cluster',
                },
                {
                    id: 'openai.gpt-4o-2024-11-20-preview-multimodal-reasoning-system',
                    displayName: 'OpenAI GPT-4o Advanced Multimodal Reasoning System 2024 Preview',
                },
            ]}
        />
    ),
    play: async ({canvasElement}) => {
        const button = canvasElement.querySelector('.model-select-button');
        button?.click();
    },
};
