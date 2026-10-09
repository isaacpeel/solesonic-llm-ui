import MessageFooter from './MessageFooter.jsx';

export default {
    title: 'Chat/MessageFooter',
    component: MessageFooter,
};

export const WithMetadata = {
    args: {
        message: {
            type: 'ASSISTANT',
            text: 'Here is the answer.',
            model: 'qwen3.5-9b',
            responseMetadata: {tokensPerSecond: 222.23},
        },
    },
};

export const WithoutMetadata = {
    args: {
        message: {
            type: 'ASSISTANT',
            text: 'Here is the answer.',
            model: 'qwen3.5-9b',
        },
    },
};

export const DefaultModelName = {
    args: {
        message: {
            type: 'ASSISTANT',
            text: 'Here is the answer.',
        },
    },
};
