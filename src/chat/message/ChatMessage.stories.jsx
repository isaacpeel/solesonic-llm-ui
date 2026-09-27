import ChatMessage from './ChatMessage.jsx';

/*
 * ChatMessage takes plain data in (`message`) and renders synchronously — no service calls, no
 * context beyond SharedDataProvider (wired globally in .storybook/preview.jsx) — so every
 * variant below is just a differently-shaped `message` object, same as tests/chat/ChatMessage.test.jsx.
 */
export default {
    title: 'Chat/ChatMessage',
    component: ChatMessage,
    parameters: {
        layout: 'padded',
    },
    decorators: [
        (Story) => (
            <div style={{maxWidth: 700, margin: '0 auto'}}>
                <Story/>
            </div>
        ),
    ],
};

export const UserMessage = {
    args: {
        message: {
            _key: 'msg-user-1',
            type: 'USER',
            text: 'Can you summarize the last quarter\'s deploy incidents?',
        },
    },
};

export const AssistantWithMetadata = {
    args: {
        message: {
            _key: 'msg-assistant-1',
            type: 'ASSISTANT',
            text: 'Here is a summary of last quarter\'s deploy incidents:\n\n1. **Rollback delay** — the canary check took too long to flag a regression.\n2. **Config drift** — a stale env var shipped to one region.\n\n```bash\nkubectl rollout undo deployment/llm-ui\n```',
            model: 'qwen3.5-9b',
            isStreaming: false,
            notifications: [],
            responseMetadataCalls: [{predictedPerSecond: 144.0545966921463}],
        },
    },
};

export const AssistantStreaming = {
    args: {
        message: {
            _key: 'msg-assistant-streaming',
            type: 'ASSISTANT',
            text: '',
            isStreaming: true,
            notifications: [],
        },
    },
};

export const AssistantWithNotifications = {
    args: {
        message: {
            _key: 'msg-assistant-notifications',
            type: 'ASSISTANT',
            text: 'Done — I searched the docs and found the answer.',
            isStreaming: false,
            model: 'qwen3.5-9b',
            notifications: ['Searching documentation…', 'Reading 3 matching pages…'],
        },
    },
};

export const SystemMessage = {
    args: {
        message: {
            _key: 'msg-system-1',
            type: 'SYSTEM',
            text: 'The model was switched to qwen3.5-9b for this conversation.',
        },
    },
};

export const ElicitationAccepted = {
    args: {
        message: {
            _key: 'msg-elicitation-accept',
            type: 'SYSTEM',
            text: 'Remove this document from the RAG index?',
            elicitationResponse: 'accept',
        },
    },
};

export const ElicitationDeclined = {
    args: {
        message: {
            _key: 'msg-elicitation-decline',
            type: 'SYSTEM',
            text: 'Remove this document from the RAG index?',
            elicitationResponse: 'decline',
        },
    },
};

export const ErrorMessage = {
    args: {
        message: {
            _key: 'msg-error-1',
            type: 'ERROR',
            text: 'The model backend timed out. Please try again.',
        },
    },
};
