import {useState} from 'react';
import {INITIAL_VIEWPORTS} from 'storybook/viewport';
import {userEvent, within} from 'storybook/test';
import ElicitationPrompt from './ElicitationPrompt.jsx';

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
