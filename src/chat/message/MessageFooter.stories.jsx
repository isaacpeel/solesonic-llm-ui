import MessageFooter from './MessageFooter.jsx';

export default {
    title: 'Chat/MessageFooter',
    component: MessageFooter,
};

const card = (
    <div style={{padding: '1px 16px', background: '#4a4a4a', color: '#dedede', borderRadius: 8}}>
        Here is the answer.
    </div>
);

export const WithMetadata = {
    args: {
        message: {
            type: 'ASSISTANT',
            text: 'Here is the answer.',
            model: 'qwen3.5-9b',
            responseMetadataCalls: [{predictedPerSecond: 144.0545966921463}],
        },
        children: card,
    },
};

export const WithoutMetadata = {
    args: {
        message: {
            type: 'ASSISTANT',
            text: 'Here is the answer.',
            model: 'qwen3.5-9b',
        },
        children: card,
    },
};

export const DefaultModelName = {
    args: {
        message: {
            type: 'ASSISTANT',
            text: 'Here is the answer.',
        },
        children: card,
    },
};

export const Hidden = {
    args: {
        message: {
            type: 'USER',
            text: 'Here is the answer.',
        },
        children: card,
    },
};
