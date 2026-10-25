import {useState} from 'react';
import {INITIAL_VIEWPORTS} from 'storybook/viewport';
import {userEvent, within} from 'storybook/test';
import ElicitationPrompt from './ElicitationPrompt.jsx';
import ChatMessage from '../chat/message/ChatMessage.jsx';
import '../chat/ChatScreen.css';

/*
 * `ElicitationPrompt`'s `fieldControl` renders a single `enum`/`oneOf` property as a `<select>`
 * dropdown only when it has more than 3 options — 3 or fewer render as buttons instead (see
 * `getEnumOptions` / `PRIMARY_ACTION_KEYWORDS` in ElicitationPrompt.jsx). The schema below has 5
 * options to land on the dropdown path. `values` is real component state here (not a static arg)
 * because the `<select>` is controlled — without `onChange` writing back through `setValues`,
 * choosing an option in the canvas would have no visible effect.
 */
export default {
    title: 'Elicitation/ElicitationPrompt',
    component: ElicitationPrompt,
    parameters: {
        layout: 'padded',
        viewport: {
            options: INITIAL_VIEWPORTS,
        },
    },
};

const DROPDOWN_ELICITATION = {
    elicitationId: 'elicit-environment',
    chatId: 'chat-1',
    message: 'Which environment should this deploy target?',
    requestedSchema: {
        properties: {
            environment: {
                type: 'string',
                title: 'Environment',
                enum: ['development', 'staging', 'production', 'sandbox', 'qa'],
            },
        },
    },
};

const IN_PROGRESS_CHAT_MESSAGES = [
    {
        _key: 'in-progress-chat-user-1',
        type: 'USER',
        text: 'Deploy the latest build for me.',
    },
    {
        _key: 'in-progress-chat-assistant-1',
        type: 'ASSISTANT',
        text: 'Sure — before I kick that off, a couple of things I\'ll need:\n\n1. Which service is this for?\n2. Should this go out as a canary or a full rollout?',
        model: 'qwen3.5-9b',
        isStreaming: false,
        notifications: [],
    },
    {
        _key: 'in-progress-chat-user-2',
        type: 'USER',
        text: 'It\'s the llm-ui frontend, full rollout is fine.',
    },
    {
        _key: 'in-progress-chat-assistant-2',
        type: 'ASSISTANT',
        text: 'Got it. Kicking off a full rollout of llm-ui from the latest build on main.',
        model: 'qwen3.5-9b',
        isStreaming: false,
        notifications: ['Resolving latest build artifact…', 'Validating deploy manifest…'],
    },
];

function ControlledElicitationPrompt({elicitation, initialValues, submitting}) {
    const [values, setValues] = useState(initialValues);

    const handleChange = (fieldName, fieldValue) => {
        setValues((previousValues) => ({...previousValues, [fieldName]: fieldValue}));
    };

    return (
        <ElicitationPrompt
            elicitation={elicitation}
            values={values}
            onChange={handleChange}
            onSubmit={() => {}}
            submitting={submitting}
        />
    );
}

const FEUD_META = {'solesonic/elicitation': 'feud'};

const FEUD_PLAY_OR_PASS = {
    elicitationId: 'elicit-feud-play-or-pass',
    chatId: 'chat-1',
    mode: 'form',
    message: 'Alex, play or pass?',
    requestedSchema: {
        type: 'object',
        required: ['choice'],
        properties: {
            choice: {type: 'string', title: 'Play or pass', oneOf: [{const: 'play', title: 'Play'}, {const: 'pass', title: 'Pass'}]},
        },
    },
    _meta: {...FEUD_META, 'feud/prompt': 'play_or_pass'},
};

const FEUD_BUZZ_IN = {
    elicitationId: 'elicit-feud-buzz-in',
    chatId: 'chat-1',
    mode: 'form',
    message: 'Face-off: who buzzed in first?',
    requestedSchema: {
        type: 'object',
        required: ['speaker', 'answer'],
        properties: {
            speaker: {type: 'string', title: 'Who buzzed in', oneOf: [{const: 'Alex', title: 'Alex'}, {const: 'Sam', title: 'Sam'}]},
            answer: {type: 'string', title: 'Answer', maxLength: 80},
        },
    },
    _meta: {...FEUD_META, 'feud/prompt': 'buzz_in'},
};

const FEUD_FAST_MONEY_READY = {
    elicitationId: 'elicit-feud-fast-money-ready',
    chatId: 'chat-1',
    mode: 'form',
    message: 'Jo, ready for Fast Money?',
    requestedSchema: {
        type: 'object',
        required: ['choice'],
        properties: {
            choice: {type: 'string', title: 'Ready', oneOf: [{const: 'ready', title: "I'm ready: start the clock"}]},
        },
    },
    _meta: {...FEUD_META, 'feud/prompt': 'fast_money_ready'},
};

const FEUD_BIG_MONEY_PICK = {
    elicitationId: 'elicit-feud-big-money-pick',
    chatId: 'chat-1',
    mode: 'form',
    message: 'Kim, which is in the top 6?',
    requestedSchema: {
        type: 'object',
        required: ['pick'],
        properties: {
            pick: {
                type: 'string',
                title: 'Your pick',
                oneOf: [
                    {const: '1', title: 'Sunscreen'},
                    {const: '2', title: 'Stapler'},
                    {const: '4', title: 'Towel'},
                    {const: '5', title: 'Mittens'},
                ],
            },
        },
    },
    _meta: {...FEUD_META, 'feud/prompt': 'big_money_pick'},
};

const FEUD_SETUP = {
    elicitationId: 'elicit-feud-setup',
    chatId: 'chat-1',
    mode: 'form',
    message: "Who's playing?",
    requestedSchema: {
        type: 'object',
        required: ['kind', 'players'],
        properties: {
            kind: {
                type: 'string',
                title: 'Game',
                oneOf: [
                    {const: 'show', title: 'The whole show'},
                    {const: 'main game', title: 'Main Game'},
                    {const: 'fast money', title: 'Fast Money (2 players)'},
                    {const: 'big money', title: 'Big Money Challenge (1 player)'},
                ],
            },
            players: {type: 'string', title: 'Players', description: 'Alex, Jo vs Sam, Kim', maxLength: 400},
        },
    },
    _meta: {...FEUD_META, 'feud/prompt': 'setup'},
};

const FEUD_REMATCH = {
    elicitationId: 'elicit-feud-rematch',
    chatId: 'chat-1',
    mode: 'form',
    message: "That's the show! Play again?",
    requestedSchema: {
        type: 'object',
        required: ['choice'],
        properties: {
            choice: {
                type: 'string',
                title: 'Play again',
                oneOf: [{const: 'new main game Alex vs Sam', title: 'Rematch'}, {const: 'new players', title: 'New players'}],
            },
        },
    },
    _meta: {...FEUD_META, 'feud/prompt': 'rematch'},
};

/*
 * Reproduces the real scroll container from ChatScreen.jsx — `.chat-app` > `.chat-content`
 * (`flex: 1; overflow-y: auto`, bounded by a fixed-height ancestor) — rather than rendering
 * ChatScreen itself, which is a page wired to useChatStream/useChatHistory/SSE/Keycloak, not a
 * props-in component Storybook can render standalone. This bounded, scrolling container is what
 * originally surfaced the dropdown panel's scrollbar bug: the open panel grew its scrollHeight
 * even though the panel itself never left the viewport.
 */
function InProgressChatWithElicitation() {
    const [values, setValues] = useState({});

    const handleChange = (fieldName, fieldValue) => {
        setValues((previousValues) => ({...previousValues, [fieldName]: fieldValue}));
    };

    return (
        <div className="chat-app" style={{height: 640}}>
            <div className="chat-content">
                {IN_PROGRESS_CHAT_MESSAGES.map((message) => (
                    <ChatMessage key={message._key} message={message} onExpandImage={() => {}}/>
                ))}

                <ElicitationPrompt
                    elicitation={DROPDOWN_ELICITATION}
                    values={values}
                    onChange={handleChange}
                    onSubmit={() => {}}
                    submitting={false}
                />
            </div>
        </div>
    );
}

export const DropdownChoice = {
    render: () => (
        <ControlledElicitationPrompt elicitation={DROPDOWN_ELICITATION} initialValues={{}} submitting={false}/>
    ),
};

export const DropdownChoiceSelected = {
    render: () => (
        <ControlledElicitationPrompt
            elicitation={DROPDOWN_ELICITATION}
            initialValues={{environment: 'staging'}}
            submitting={false}
        />
    ),
};

export const DropdownChoiceSubmitting = {
    render: () => (
        <ControlledElicitationPrompt
            elicitation={DROPDOWN_ELICITATION}
            initialValues={{environment: 'production'}}
            submitting={true}
        />
    ),
};

export const DropdownChoiceMobile = {
    globals: {
        viewport: {value: 'iphone6', isRotated: false},
    },
    render: () => (
        <ControlledElicitationPrompt elicitation={DROPDOWN_ELICITATION} initialValues={{}} submitting={false}/>
    ),
};

export const DropdownChoiceMobileSelected = {
    globals: {
        viewport: {value: 'iphone6', isRotated: false},
    },
    render: () => (
        <ControlledElicitationPrompt
            elicitation={DROPDOWN_ELICITATION}
            initialValues={{environment: 'staging'}}
            submitting={false}
        />
    ),
};

/*
 * Opens the panel via `play` (rather than a pre-selected value) so the mobile viewport shows the
 * floating option list itself — the thing most likely to clip or overflow at 375px width.
 */
export const DropdownChoiceMobileOpen = {
    globals: {
        viewport: {value: 'iphone6', isRotated: false},
    },
    render: () => (
        <ControlledElicitationPrompt elicitation={DROPDOWN_ELICITATION} initialValues={{}} submitting={false}/>
    ),
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);
        const trigger = await canvas.findByRole('button', {name: /select an option/i});
        await userEvent.click(trigger);
    },
};

/*
 * `fullscreen` rather than the default `padded` layout: this story's own `.chat-app` wrapper
 * already sizes itself to mimic the app's viewport, and Storybook's padding would just shrink
 * that further.
 */
export const InProgressChat = {
    parameters: {
        layout: 'fullscreen',
    },
    render: () => <InProgressChatWithElicitation/>,
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);
        const trigger = await canvas.findByRole('button', {name: /select an option/i});
        await userEvent.click(trigger);
    },
};

export const FeudPlayOrPass = {
    render: () => <ControlledElicitationPrompt elicitation={FEUD_PLAY_OR_PASS} initialValues={{}} submitting={false}/>,
};

export const FeudBuzzIn = {
    render: () => <ControlledElicitationPrompt elicitation={FEUD_BUZZ_IN} initialValues={{}} submitting={false}/>,
};

export const FeudBuzzInFilled = {
    render: () => (
        <ControlledElicitationPrompt
            elicitation={FEUD_BUZZ_IN}
            initialValues={{speaker: 'Sam', answer: 'toothbrush'}}
            submitting={false}
        />
    ),
};

export const FeudFastMoneyReady = {
    render: () => <ControlledElicitationPrompt elicitation={FEUD_FAST_MONEY_READY} initialValues={{}} submitting={false}/>,
};

export const FeudBigMoneyPick = {
    render: () => <ControlledElicitationPrompt elicitation={FEUD_BIG_MONEY_PICK} initialValues={{}} submitting={false}/>,
};

export const FeudBigMoneyPickMobile = {
    globals: {
        viewport: {value: 'iphone6', isRotated: false},
    },
    render: () => <ControlledElicitationPrompt elicitation={FEUD_BIG_MONEY_PICK} initialValues={{}} submitting={false}/>,
};

export const FeudSetup = {
    render: () => <ControlledElicitationPrompt elicitation={FEUD_SETUP} initialValues={{}} submitting={false}/>,
};

export const FeudRematch = {
    render: () => <ControlledElicitationPrompt elicitation={FEUD_REMATCH} initialValues={{}} submitting={false}/>,
};
