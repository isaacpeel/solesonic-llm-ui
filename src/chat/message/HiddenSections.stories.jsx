import ChatMessage from './ChatMessage.jsx';
import {presentForViewer} from './hiddenSections.js';

const TRANSCRIPT = [
    {
        _key: 'hidden-ready',
        type: 'ASSISTANT',
        text: 'Fast Money! Alex plays first.\n[[hidden:Sam]]\n1. Name a fruit you peel.\n2. Name something at the beach.\n3. Name a breakfast food.\n[[/hidden]]\nSam, please look away.',
        notifications: [],
    },
    {
        _key: 'hidden-answers',
        type: 'USER',
        text: '[[hidden:Sam]]banana, sunscreen, eggs[[/hidden]]',
        senderName: 'Alex',
    },
    {
        _key: 'hidden-score',
        type: 'ASSISTANT',
        text: 'Thanks Alex.\n[[hidden:Sam]]\nYou scored **142** points.\n[[/hidden]]\nSam, your turn — same questions, no repeats.',
        notifications: [],
    },
];

function TranscriptAs({viewerName}) {
    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
            {TRANSCRIPT.map((message) => (
                <div key={message._key}>
                    {message.senderName && (
                        <div style={{fontSize: 12, opacity: 0.7}}>
                            {message.senderName === viewerName ? 'You' : message.senderName}
                        </div>
                    )}
                    <ChatMessage message={{...message, text: presentForViewer(message.text, viewerName)}}/>
                </div>
            ))}
        </div>
    );
}

export default {
    title: 'Shared sessions/Hidden sections',
    component: TranscriptAs,
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

export const AsAlex = {
    args: {viewerName: 'Alex'},
};

export const AsSam = {
    args: {viewerName: 'Sam'},
};

export const BeforeTheSessionLoads = {
    args: {viewerName: null},
};
