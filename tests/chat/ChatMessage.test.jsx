import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
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
            const {container} = render(<ChatMessage message={buildMessage({type: 'USER', text: 'Hello'})} />);
            expect(container.querySelector('.chat-message-container.USER')).not.toBeNull();
        });

        it('does not render info-icon wrapper for USER messages', () => {
            const {container} = render(<ChatMessage message={buildMessage({type: 'USER', text: 'Hello'})} />);
            expect(container.querySelector('.info-icon-wrapper')).toBeNull();
        });

        it('renders AI message with ASSISTANT type class', () => {
            const {container} = render(<ChatMessage message={buildMessage({type: 'ASSISTANT', text: 'Hi there'})} />);
            expect(container.querySelector('.chat-message-container.ASSISTANT')).not.toBeNull();
        });

        it('renders info-icon wrapper for AI messages', () => {
            const {container} = render(<ChatMessage message={buildMessage({type: 'ASSISTANT', text: 'Hi'})} />);
            expect(container.querySelector('.info-icon-wrapper')).not.toBeNull();
        });

        it('renders SYSTEM message with SYSTEM type class', () => {
            const {container} = render(<ChatMessage message={buildMessage({type: 'SYSTEM', text: 'System info'})} />);
            expect(container.querySelector('.chat-message-container.SYSTEM')).not.toBeNull();
        });

        it('renders info-icon wrapper for SYSTEM messages', () => {
            const {container} = render(<ChatMessage message={buildMessage({type: 'SYSTEM', text: 'System info'})} />);
            expect(container.querySelector('.info-icon-wrapper')).not.toBeNull();
        });
    });

    describe('placeholder', () => {
        it('shows "Thinking..." when AI message is streaming with no text and no notifications', () => {
            render(<ChatMessage message={buildMessage({type: 'ASSISTANT', text: '', isStreaming: true})} />);
            expect(screen.getByText('Thinking...')).toBeDefined();
        });

        it('does not show placeholder when text is present', () => {
            render(<ChatMessage message={buildMessage({type: 'ASSISTANT', text: 'Some text', isStreaming: true})} />);
            expect(screen.queryByText('Thinking...')).toBeNull();
        });

        it('does not show placeholder when notifications are present', () => {
            render(<ChatMessage message={buildMessage({
                type: 'ASSISTANT',
                text: '',
                isStreaming: true,
                notifications: ['Step 1'],
            })} />);
            expect(screen.queryByText('Thinking...')).toBeNull();
        });
    });

    describe('elicitation response', () => {
        it('renders elicitation response container with SYSTEM class', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Do you accept?',
                elicitationResponse: 'accept',
            })} />);
            expect(container.querySelector('.elicitation-resolved')).not.toBeNull();
        });

        it('applies positive badge modifier for "accept"', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Do you accept?',
                elicitationResponse: 'accept',
            })} />);
            expect(container.querySelector('.elicitation-resolved-badge--positive')).not.toBeNull();
        });

        it('applies positive badge modifier for "yes"', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Continue?',
                elicitationResponse: 'yes',
            })} />);
            expect(container.querySelector('.elicitation-resolved-badge--positive')).not.toBeNull();
        });

        it('applies negative badge modifier for "decline"', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Do you accept?',
                elicitationResponse: 'decline',
            })} />);
            expect(container.querySelector('.elicitation-resolved-badge--negative')).not.toBeNull();
        });

        it('applies negative badge modifier for "no"', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Continue?',
                elicitationResponse: 'no',
            })} />);
            expect(container.querySelector('.elicitation-resolved-badge--negative')).not.toBeNull();
        });

        it('applies neutral badge modifier for unknown response', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Question?',
                elicitationResponse: 'maybe',
            })} />);
            expect(container.querySelector('.elicitation-resolved-badge--neutral')).not.toBeNull();
        });

        it('capitalises the first letter of the response and lowercases the rest', () => {
            render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Question?',
                elicitationResponse: 'ACCEPT',
            })} />);
            expect(screen.getByText('✓ Accept')).toBeDefined();
        });

        it('renders the question text', () => {
            render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Do you agree?',
                elicitationResponse: 'yes',
            })} />);
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
            })} />);
            expect(container.querySelector('.notification-log')).not.toBeNull();
        });

        it('does not render notification log for USER messages', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'USER',
                text: 'Hello',
                notifications: ['Step 1'],
            })} />);
            expect(container.querySelector('.notification-log')).toBeNull();
        });

        it('does not render notification log for elicitation messages', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'SYSTEM',
                text: 'Do you accept?',
                elicitationResponse: 'yes',
                notifications: ['Step 1'],
            })} />);
            expect(container.querySelector('.notification-log')).toBeNull();
        });
    });

    describe('markdown body', () => {
        it('renders message text in a markdown-body container', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'ASSISTANT',
                text: 'Hello **world**',
                isStreaming: false,
            })} />);
            expect(container.querySelector('.markdown-body')).not.toBeNull();
        });

        it('renders links with target="_blank" and rel="noopener noreferrer"', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'ASSISTANT',
                text: '[click here](https://example.com)',
                isStreaming: false,
            })} />);
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
            })} />);

            expect(container.querySelector('.message-attachments')).not.toBeNull();
            expect(screen.getByAltText('one.png')).toBeTruthy();
        });

        it('renders no strip on an ASSISTANT message even when it carries attachments', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'ASSISTANT',
                text: 'here is my answer',
                attachments: [{id: 'a1', fileName: 'one.png', localObjectUrl: 'blob:local-1'}],
            })} />);

            expect(container.querySelector('.message-attachments')).toBeNull();
        });

        it('renders no strip for an empty or missing attachments array', () => {
            const {container: emptyContainer} = render(<ChatMessage message={buildMessage({
                type: 'USER',
                text: 'plain',
                attachments: [],
            })} />);
            expect(emptyContainer.querySelector('.message-attachments')).toBeNull();

            const {container: missingContainer} = render(<ChatMessage message={buildMessage({
                type: 'USER',
                text: 'plain',
            })} />);
            expect(missingContainer.querySelector('.message-attachments')).toBeNull();
        });

        it('warns on an assistant turn whose vision step was never confirmed', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                text: 'I am not sure which flowers you mean.',
                visionStepUnconfirmed: true,
            })} />);

            expect(container.querySelector('.message-vision-unconfirmed')).not.toBeNull();
        });

        it('renders no vision warning on a confirmed turn or on a USER message', () => {
            const {container: confirmedContainer} = render(<ChatMessage message={buildMessage({
                text: 'Those are hydrangeas.',
                visionStepUnconfirmed: false,
            })} />);
            expect(confirmedContainer.querySelector('.message-vision-unconfirmed')).toBeNull();

            const {container: userContainer} = render(<ChatMessage message={buildMessage({
                type: 'USER',
                text: 'what are these',
                visionStepUnconfirmed: true,
            })} />);
            expect(userContainer.querySelector('.message-vision-unconfirmed')).toBeNull();
        });

        it('renders the message text alongside its attachments', () => {
            render(<ChatMessage message={buildMessage({
                type: 'USER',
                text: 'what is wrong here',
                attachments: [{id: 'a1', fileName: 'one.png', localObjectUrl: 'blob:local-1'}],
            })} />);

            expect(screen.getByText('what is wrong here')).toBeTruthy();
            expect(screen.getByAltText('one.png')).toBeTruthy();
        });
    });

    describe('reconnecting notice', () => {
        it('renders on an AI message whose stream is being recovered', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                text: 'partial answer',
                isStreaming: true,
                isReconnecting: true,
            })} />);

            expect(container.querySelector('.message-reconnecting')).not.toBeNull();
            /* The tokens already on screen must survive the disconnect. */
            expect(screen.getByText('partial answer')).toBeTruthy();
        });

        it('renders nothing once recovery has cleared the flag', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                text: 'complete answer',
                isReconnecting: false,
            })} />);

            expect(container.querySelector('.message-reconnecting')).toBeNull();
        });

        it('renders nothing on a USER message', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'USER',
                text: 'question',
                isReconnecting: true,
            })} />);

            expect(container.querySelector('.message-reconnecting')).toBeNull();
        });
    });
});
