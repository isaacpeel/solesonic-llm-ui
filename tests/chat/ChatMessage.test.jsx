import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import ChatMessage from '../../src/chat/message/ChatMessage.jsx';

function buildMessage(overrides) {
    return {
        type: 'ASSISTANT',
        text: '',
        _key: 'msg-1',
        isStreaming: false,
        notifications: [],
        ...overrides,
    };
}

describe('ChatMessage', () => {
    describe('message type rendering', () => {
        it('renders USER message with USER type class', () => {
            const {container} = render(<ChatMessage message={buildMessage({type: 'USER', text: 'Hello'})}/>);
            expect(container.querySelector('.chat-message-container.USER')).not.toBeNull();
        });

        it('does not mark USER messages with the info status role', () => {
            const {container} = render(<ChatMessage message={buildMessage({type: 'USER', text: 'Hello'})}/>);
            expect(container.querySelector('[role="status"]')).toBeNull();
        });

        it('renders AI message with ASSISTANT type class', () => {
            const {container} = render(<ChatMessage message={buildMessage({type: 'ASSISTANT', text: 'Hi there'})}/>);
            expect(container.querySelector('.chat-message-container.ASSISTANT')).not.toBeNull();
        });

        it('does not mark plain AI messages with the info status role', () => {
            const {container} = render(<ChatMessage message={buildMessage({type: 'ASSISTANT', text: 'Hi'})}/>);
            expect(container.querySelector('[role="status"]')).toBeNull();
        });

        it('renders SYSTEM message with SYSTEM type class', () => {
            const {container} = render(<ChatMessage message={buildMessage({type: 'SYSTEM', text: 'System info'})}/>);
            expect(container.querySelector('.chat-message-container.SYSTEM')).not.toBeNull();
        });

        it('marks SYSTEM messages with the info status role', () => {
            const {container} = render(<ChatMessage message={buildMessage({type: 'SYSTEM', text: 'System info'})}/>);
            expect(container.querySelector('[role="status"]')).not.toBeNull();
        });

        it('renders ERROR message with ERROR type class', () => {
            const {container} = render(<ChatMessage message={buildMessage({type: 'ERROR', text: 'The model timed out.'})}/>);
            expect(container.querySelector('.chat-message-container.ERROR')).not.toBeNull();
        });

        it('marks ERROR messages with the alert role', () => {
            const {container} = render(<ChatMessage message={buildMessage({type: 'ERROR', text: 'The model timed out.'})}/>);
            const alertElement = container.querySelector('[role="alert"]');
            expect(alertElement).not.toBeNull();
            expect(alertElement.getAttribute('aria-label')).toBe('Error message');
        });

        it('renders an error header alongside the message text', () => {
            const {container} = render(<ChatMessage message={buildMessage({type: 'ERROR', text: 'The model timed out.'})}/>);
            expect(container.querySelector('.message-error-header')).not.toBeNull();
            expect(screen.getByText('The model timed out.')).toBeDefined();
        });
    });

    describe('placeholder', () => {
        it('shows "Thinking..." when AI message is streaming with no text and no notifications', () => {
            render(<ChatMessage message={buildMessage({type: 'ASSISTANT', text: '', isStreaming: true})}/>);
            expect(screen.getByText('Thinking...')).toBeDefined();
        });

        it('does not show placeholder when text is present', () => {
            render(<ChatMessage message={buildMessage({type: 'ASSISTANT', text: 'Some text', isStreaming: true})}/>);
            expect(screen.queryByText('Thinking...')).toBeNull();
        });

        it('does not show placeholder when notifications are present', () => {
            render(<ChatMessage message={buildMessage({
                type: 'ASSISTANT',
                text: '',
                isStreaming: true,
                notifications: ['Step 1'],
            })}/>);
            expect(screen.queryByText('Thinking...')).toBeNull();
        });
    });

    describe('elicitation response', () => {
        it('renders elicitation response container with SYSTEM class', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Do you accept?',
                elicitationResponse: 'accept',
            })}/>);
            expect(container.querySelector('.elicitation-resolved')).not.toBeNull();
        });

        it('applies positive badge modifier for "accept"', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Do you accept?',
                elicitationResponse: 'accept',
            })}/>);
            expect(container.querySelector('.elicitation-resolved-badge--positive')).not.toBeNull();
        });

        it('applies positive badge modifier for "yes"', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Continue?',
                elicitationResponse: 'yes',
            })}/>);
            expect(container.querySelector('.elicitation-resolved-badge--positive')).not.toBeNull();
        });

        it('applies negative badge modifier for "decline"', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Do you accept?',
                elicitationResponse: 'decline',
            })}/>);
            expect(container.querySelector('.elicitation-resolved-badge--negative')).not.toBeNull();
        });

        it('applies negative badge modifier for "no"', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Continue?',
                elicitationResponse: 'no',
            })}/>);
            expect(container.querySelector('.elicitation-resolved-badge--negative')).not.toBeNull();
        });

        it('applies neutral badge modifier for unknown response', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Question?',
                elicitationResponse: 'maybe',
            })}/>);
            expect(container.querySelector('.elicitation-resolved-badge--neutral')).not.toBeNull();
        });

        it('capitalises the first letter of the response and lowercases the rest', () => {
            render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Question?',
                elicitationResponse: 'ACCEPT',
            })}/>);
            expect(screen.getByText('✓ Accept')).toBeDefined();
        });

        it('renders the question text', () => {
            render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Do you agree?',
                elicitationResponse: 'yes',
            })}/>);
            expect(screen.getByText('Do you agree?')).toBeDefined();
        });
    });

    describe('notification log', () => {
        it('renders notification log for AI messages with notifications', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'ASSISTANT',
                text: 'Done',
                isStreaming: false,
                notifications: ['Step 1'],
            })}/>);
            expect(container.querySelector('.notification-log')).not.toBeNull();
        });

        it('does not render notification log for USER messages', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'USER',
                text: 'Hello',
                notifications: ['Step 1'],
            })}/>);
            expect(container.querySelector('.notification-log')).toBeNull();
        });

        it('does not render notification log for elicitation messages', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Do you accept?',
                elicitationResponse: 'yes',
                notifications: ['Step 1'],
            })}/>);
            expect(container.querySelector('.notification-log')).toBeNull();
        });
    });

    describe('markdown body', () => {
        it('renders message text in a markdown-body container', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'ASSISTANT',
                text: 'Hello **world**',
                isStreaming: false,
            })}/>);
            expect(container.querySelector('.markdown-body')).not.toBeNull();
        });

        it('renders links with target="_blank" and rel="noopener noreferrer"', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'ASSISTANT',
                text: '[click here](https://example.com)',
                isStreaming: false,
            })}/>);
            const anchor = container.querySelector('a');
            expect(anchor).not.toBeNull();
            expect(anchor.getAttribute('target')).toBe('_blank');
            expect(anchor.getAttribute('rel')).toBe('noopener noreferrer');
        });
    });

    describe('attachments', () => {
        it('renders an attachment strip on a USER message', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'USER',
                text: 'look at this',
                attachments: [{id: 'a1', fileName: 'one.png', localObjectUrl: 'blob:local-1'}],
            })}/>);

            expect(container.querySelector('.message-attachments')).not.toBeNull();
            expect(screen.getByAltText('one.png')).toBeTruthy();
        });

        it('renders no strip on an ASSISTANT message even when it carries attachments', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'ASSISTANT',
                text: 'here is my answer',
                attachments: [{id: 'a1', fileName: 'one.png', localObjectUrl: 'blob:local-1'}],
            })}/>);

            expect(container.querySelector('.message-attachments')).toBeNull();
        });

        it('renders no strip for an empty or missing attachments array', () => {
            const {container: emptyContainer} = render(<ChatMessage message={buildMessage({
                type: 'USER',
                text: 'plain',
                attachments: [],
            })}/>);
            expect(emptyContainer.querySelector('.message-attachments')).toBeNull();

            const {container: missingContainer} = render(<ChatMessage message={buildMessage({
                type: 'USER',
                text: 'plain',
            })}/>);
            expect(missingContainer.querySelector('.message-attachments')).toBeNull();
        });

        it('warns on an assistant turn whose vision step was never confirmed', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                text: 'I am not sure which flowers you mean.',
                visionStepUnconfirmed: true,
            })}/>);

            expect(container.querySelector('.message-vision-unconfirmed')).not.toBeNull();
        });

        it('renders no vision warning on a confirmed turn or on a USER message', () => {
            const {container: confirmedContainer} = render(<ChatMessage message={buildMessage({
                text: 'Those are hydrangeas.',
                visionStepUnconfirmed: false,
            })}/>);
            expect(confirmedContainer.querySelector('.message-vision-unconfirmed')).toBeNull();

            const {container: userContainer} = render(<ChatMessage message={buildMessage({
                type: 'USER',
                text: 'what are these',
                visionStepUnconfirmed: true,
            })}/>);
            expect(userContainer.querySelector('.message-vision-unconfirmed')).toBeNull();
        });

        it('renders the message text alongside its attachments', () => {
            render(<ChatMessage message={buildMessage({
                type: 'USER',
                text: 'what is wrong here',
                attachments: [{id: 'a1', fileName: 'one.png', localObjectUrl: 'blob:local-1'}],
            })}/>);

            expect(screen.getByText('what is wrong here')).toBeTruthy();
            expect(screen.getByAltText('one.png')).toBeTruthy();
        });
    });

    describe('model name', () => {
        it('renders the top-level model field', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                text: 'the answer',
                model: 'legacy-model',
                responseMetadata: {},
            })}/>);

            expect(container.querySelector('.message-model-name').textContent).toBe('legacy-model');
        });

        it('falls back to "AI Assistant" when neither field carries a model', () => {
            const {container} = render(<ChatMessage message={buildMessage({text: 'the answer'})}/>);

            expect(container.querySelector('.message-model-name').textContent).toBe('AI Assistant');
        });

        it('falls back to responseMetadata.routedModel when the top-level model is absent', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                text: 'the answer',
                responseMetadata: {routedModel: 'qwen3.5-9b', model: 'auto-model'},
            })}/>);

            expect(container.querySelector('.message-model-name').textContent).toBe('qwen3.5-9b');
        });

        it('falls back to responseMetadata.model when routedModel is absent', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                text: 'the answer',
                responseMetadata: {model: 'auto-model'},
            })}/>);

            expect(container.querySelector('.message-model-name').textContent).toBe('auto-model');
        });
    });

    describe('copy button', () => {
        let writeText;
        let originalClipboardDescriptor;

        beforeEach(() => {
            writeText = vi.fn().mockResolvedValue(undefined);
            originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
            Object.defineProperty(navigator, 'clipboard', {value: {writeText}, configurable: true});
        });

        afterEach(() => {
            if (originalClipboardDescriptor) {
                Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
                return;
            }

            delete navigator.clipboard;
        });

        it('renders on a finished ASSISTANT message', () => {
            const {container} = render(<ChatMessage message={buildMessage({text: 'the answer'})}/>);
            expect(container.querySelector('.message-copy-button')).not.toBeNull();
        });

        it('renders in an action row beneath the card', () => {
            const {container} = render(<ChatMessage message={buildMessage({text: 'the answer'})}/>);

            const wrapper = container.querySelector('.message-with-actions');
            expect(wrapper).not.toBeNull();
            expect(wrapper.querySelector('.message-actions .message-copy-button')).not.toBeNull();
            /* The row must follow the card, not precede it. */
            expect(wrapper.children[0].classList.contains('message')).toBe(true);
            expect(wrapper.children[1].classList.contains('message-actions')).toBe(true);
        });

        /* The footer no longer waits for hover or a tap — it renders with the message. */
        it('renders the action row without requiring hover or a click', () => {
            const {container} = render(<ChatMessage message={buildMessage({text: 'the answer'})}/>);

            const wrapper = container.querySelector('.message-with-actions');
            expect(wrapper.querySelector('.message-actions .message-copy-button')).not.toBeNull();
        });

        it('keeps the action row rendered after the pointer leaves the message', async () => {
            const {container} = render(<ChatMessage message={buildMessage({text: 'the answer'})}/>);

            const wrapper = container.querySelector('.message-with-actions');
            fireEvent.click(wrapper.querySelector('.message-copy-button'));

            await waitFor(() => expect(wrapper.querySelector('.message-copy-button--copied')).not.toBeNull());

            fireEvent.mouseLeave(wrapper);

            expect(wrapper.querySelector('.message-actions .message-copy-button')).not.toBeNull();
        });

        it('does not render a timestamp beside the copy button', () => {
            const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
            const {container} = render(<ChatMessage message={buildMessage({
                text: 'the answer',
                timestamp: twoDaysAgo,
            })}/>);

            expect(container.querySelector('.message-actions .message-timestamp')).toBeNull();
        });

        /* An unparseable or absent stamp must leave the copy button alone, not print "Invalid Date". */
        it('renders no timestamp when the message carries none', () => {
            const {container} = render(<ChatMessage message={buildMessage({text: 'the answer'})}/>);

            expect(container.querySelector('.message-timestamp')).toBeNull();
            expect(container.querySelector('.message-copy-button')).not.toBeNull();
        });

        it('leaves messages with no copy action unwrapped', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'USER',
                text: 'my question',
            })}/>);

            expect(container.querySelector('.message-with-actions')).toBeNull();
            expect(container.querySelector('.message')).not.toBeNull();
        });

        it('does not render while the answer is still streaming', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                text: 'partial',
                isStreaming: true,
            })}/>);

            expect(container.querySelector('.message-copy-button')).toBeNull();
        });

        it('does not render on USER, SYSTEM or elicitation messages', () => {
            const {container: userContainer} = render(<ChatMessage message={buildMessage({
                type: 'USER',
                text: 'my question',
            })}/>);
            expect(userContainer.querySelector('.message-copy-button')).toBeNull();

            const {container: systemContainer} = render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'system info',
            })}/>);
            expect(systemContainer.querySelector('.message-copy-button')).toBeNull();

            const {container: elicitationContainer} = render(<ChatMessage message={buildMessage({
                text: 'Do you accept?',
                elicitationResponse: 'accept',
            })}/>);
            expect(elicitationContainer.querySelector('.message-copy-button')).toBeNull();
        });

        it('does not render on an answer with no text', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                text: '   ',
                notifications: ['Step 1'],
            })}/>);

            expect(container.querySelector('.message-copy-button')).toBeNull();
        });

        /* The welcome greeting is client-side filler with no timestamp — no action row at all. */
        it('does not render the action row on an ephemeral message', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                text: 'Hi! How can I assist you today?',
                ephemeral: true,
            })}/>);

            expect(container.querySelector('.message-with-actions')).toBeNull();
            expect(container.querySelector('.message-actions')).toBeNull();
            expect(container.querySelector('.message-copy-button')).toBeNull();
        });

        /* The bubble shows rendered HTML; the clipboard must get the markdown behind it. */
        it('copies the raw markdown rather than the rendered text', async () => {
            const markdown = '## Heading\n\n- one\n- two\n\n`code`';
            const {container} = render(<ChatMessage message={buildMessage({text: markdown})}/>);

            fireEvent.click(container.querySelector('.message-copy-button'));

            await waitFor(() => expect(writeText).toHaveBeenCalledWith(markdown));
        });

        it('renders a tokens-per-second figure computed from completionTokens and totalMillis', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                text: 'the answer',
                responseMetadata: {
                    promptTokens: 1555,
                    completionTokens: 105,
                    totalTokens: 1660,
                    totalMillis: 204.277,
                },
            })}/>);

            const responseMetadata = container.querySelector('.message-actions .message-response-metadata');
            expect(responseMetadata).not.toBeNull();
            expect(responseMetadata.textContent).toBe('514.0 tok/s');
        });

        it('prefers a precomputed tokensPerSecond over deriving one', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                text: 'the answer',
                responseMetadata: {
                    completionTokens: 128,
                    totalMillis: 3690,
                    tokensPerSecond: 34.7,
                },
            })}/>);

            const responseMetadata = container.querySelector('.message-actions .message-response-metadata');
            expect(responseMetadata).not.toBeNull();
            expect(responseMetadata.textContent).toBe('34.7 tok/s');
        });

        /*
         * On this response shape totalMillis is proxy/overhead time only, not generation time, so
         * responseMetadataCalls[0].predictedPerSecond — the backend's own generation-speed figure —
         * must win over both tokensPerSecond and the completionTokens/totalMillis derivation.
         */
        it('prefers responseMetadataCalls[0].predictedPerSecond over responseMetadata entirely', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                text: 'the answer',
                responseMetadata: {
                    completionTokens: 82,
                    totalMillis: 33.349,
                    tokensPerSecond: 9999,
                },
                responseMetadataCalls: [{predictedPerSecond: 144.0545966921463}],
            })}/>);

            const responseMetadata = container.querySelector('.message-actions .message-response-metadata');
            expect(responseMetadata).not.toBeNull();
            expect(responseMetadata.textContent).toBe('144.0 tok/s');
        });

        /* Floors rather than rounds: 144.09 must read 144.0, not 144.1. */
        it('floors the tokens-per-second figure to one decimal rather than rounding', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                text: 'the answer',
                responseMetadataCalls: [{predictedPerSecond: 144.09}],
            })}/>);

            const responseMetadata = container.querySelector('.message-actions .message-response-metadata');
            expect(responseMetadata).not.toBeNull();
            expect(responseMetadata.textContent).toBe('144.0 tok/s');
        });

        it('renders no response metadata element when completionTokens or totalMillis is missing', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                text: 'the answer',
                responseMetadata: {
                    promptTokens: 412,
                    completionTokens: null,
                    totalTokens: 540,
                },
            })}/>);

            expect(container.querySelector('.message-response-metadata')).toBeNull();
        });

        it('renders no response metadata element when the message carries none', () => {
            const {container} = render(<ChatMessage message={buildMessage({text: 'the answer'})}/>);

            expect(container.querySelector('.message-response-metadata')).toBeNull();
        });

        it('confirms on the button once the copy resolves', async () => {
            const {container} = render(<ChatMessage message={buildMessage({text: 'the answer'})}/>);

            fireEvent.click(container.querySelector('.message-copy-button'));

            await waitFor(() => expect(container.querySelector('.message-copy-button--copied')).not.toBeNull());
        });

        it('leaves the button unconfirmed when the clipboard write rejects', async () => {
            writeText.mockRejectedValue(new Error('denied'));
            const {container} = render(<ChatMessage message={buildMessage({text: 'the answer'})}/>);

            fireEvent.click(container.querySelector('.message-copy-button'));

            await waitFor(() => expect(writeText).toHaveBeenCalled());
            expect(container.querySelector('.message-copy-button--copied')).toBeNull();
        });
    });
});
