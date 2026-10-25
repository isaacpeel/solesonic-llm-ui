import {describe, it, expect, vi, afterEach} from 'vitest';
import {useState} from 'react';
import {render, screen, fireEvent, cleanup} from '@testing-library/react';
import ElicitationPrompt from '../../src/elicitation/ElicitationPrompt.jsx';

const FEUD_META = {'solesonic/elicitation': 'feud'};

const PLAY_OR_PASS = {
    elicitationId: 'elicit-play',
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

const BUZZ_IN = {
    elicitationId: 'elicit-buzz',
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

const BIG_MONEY_PICK = {
    elicitationId: 'elicit-pick',
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

const MCP_TITLE_PROMPT = {
    elicitationId: 'elicit-mcp',
    chatId: 'chat-1',
    message: 'What should the title be?',
    requestedSchema: {
        properties: {
            title: {type: 'string', title: 'Title'},
        },
    },
};

function ControlledPrompt({elicitation, onSubmit, onDismiss, initialValues = {}}) {
    const [values, setValues] = useState(initialValues);

    return (
        <ElicitationPrompt
            elicitation={elicitation}
            values={values}
            onChange={(fieldName, fieldValue) => setValues((previousValues) => ({...previousValues, [fieldName]: fieldValue}))}
            onSubmit={onSubmit}
            onDismiss={onDismiss}
            submitting={false}
        />
    );
}

function renderPrompt(elicitation, props = {}) {
    const onSubmit = vi.fn();
    const onDismiss = vi.fn();
    const renderResult = render(<ControlledPrompt elicitation={elicitation} onSubmit={onSubmit} onDismiss={onDismiss} {...props}/>);

    return {...renderResult, onSubmit, onDismiss};
}

function submitButton(container) {
    return [...container.querySelectorAll('button')].find((button) => button.textContent === 'Submit');
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('ElicitationPrompt', () => {
    it('renders Play and Pass as buttons and submits the clicked choice', () => {
        const {onSubmit} = renderPrompt(PLAY_OR_PASS);

        fireEvent.click(screen.getByText('Play'));

        expect(screen.getByText('Pass')).toBeTruthy();
        expect(onSubmit).toHaveBeenCalledWith({choice: 'play'});
    });

    it('keeps Submit disabled until every required field is filled', () => {
        const {container} = renderPrompt(BUZZ_IN);

        expect(submitButton(container).disabled).toBe(true);

        fireEvent.click(screen.getByText('Sam'));
        expect(submitButton(container).disabled).toBe(true);

        fireEvent.change(container.querySelector('input[type="text"]'), {target: {value: '   '}});
        expect(submitButton(container).disabled).toBe(true);

        fireEvent.change(container.querySelector('input[type="text"]'), {target: {value: 'toothbrush'}});
        expect(submitButton(container).disabled).toBe(false);
    });

    it('marks required fields on their labels', () => {
        const {container} = renderPrompt(BUZZ_IN);

        expect(container.querySelectorAll('.elicitation-required-marker').length).toBe(2);
    });

    it('shows which option of a form field is selected', () => {
        renderPrompt(BUZZ_IN);

        fireEvent.click(screen.getByText('Sam'));

        expect(screen.getByText('Sam').getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByText('Alex').getAttribute('aria-pressed')).toBe('false');
    });

    it('submits the form on Enter in its last text input once it is complete', () => {
        const {container, onSubmit} = renderPrompt(BUZZ_IN);
        const answerInput = container.querySelector('input[type="text"]');

        fireEvent.keyDown(answerInput, {key: 'Enter'});
        expect(onSubmit).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('Alex'));
        fireEvent.change(answerInput, {target: {value: 'toothbrush'}});
        fireEvent.keyDown(answerInput, {key: 'Enter'});

        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("offers I'll type it on a dismissible prompt and dismisses instead of cancelling", () => {
        const {onSubmit, onDismiss} = renderPrompt(BUZZ_IN);

        expect(screen.queryByText('Cancel')).toBeNull();
        fireEvent.click(screen.getByText("I'll type it"));

        expect(onDismiss).toHaveBeenCalledTimes(1);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('still offers Cancel on an MCP prompt', () => {
        const {onSubmit, onDismiss} = renderPrompt(MCP_TITLE_PROMPT);

        expect(screen.queryByText("I'll type it")).toBeNull();
        fireEvent.click(screen.getByText('Cancel'));

        expect(onSubmit).toHaveBeenCalledWith({action: 'cancel'});
        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('renders the Big Money pick as a dropdown', () => {
        const {container} = renderPrompt(BIG_MONEY_PICK);

        expect(container.querySelector('.elicitation-dropdown-trigger')).not.toBeNull();
        expect(screen.queryByText('Sunscreen')).toBeNull();
    });

    it('moves focus to the first control when a prompt opens', () => {
        renderPrompt(PLAY_OR_PASS);

        expect(document.activeElement).toBe(screen.getByText('Play'));
    });
});
