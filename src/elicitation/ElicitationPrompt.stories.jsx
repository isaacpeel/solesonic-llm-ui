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
