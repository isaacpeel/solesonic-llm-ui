import {describe, it, expect, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import ChatMessage from '../../src/chat/ChatMessage.jsx';

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
        it('shows spinner and last notification while streaming', () => {
            render(<ChatMessage message={buildMessage({
                type: 'ASSISTANT',
                text: '',
                isStreaming: true,
                notifications: ['Step 1', 'Step 2'],
            })} />);
            expect(screen.getByText('Step 2')).toBeDefined();
            expect(screen.queryByRole('list')).toBeNull();
        });

        it('shows step count button when finalized', () => {
            render(<ChatMessage message={buildMessage({
                type: 'ASSISTANT',
                text: 'Done',
                isStreaming: false,
                notifications: ['Step 1', 'Step 2'],
            })} />);
            expect(screen.getByText('2 steps completed')).toBeDefined();
        });

        it('uses singular "step" when only one notification', () => {
            render(<ChatMessage message={buildMessage({
                type: 'ASSISTANT',
                text: 'Done',
                isStreaming: false,
                notifications: ['Only step'],
            })} />);
            expect(screen.getByText('1 step completed')).toBeDefined();
        });

        it('step list is collapsed by default', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'ASSISTANT',
                text: 'Done',
                isStreaming: false,
                notifications: ['Step 1'],
            })} />);
            expect(container.querySelector('.notification-log-step-list')).toBeNull();
        });

        it('expands step list when toggle is clicked', () => {
            render(<ChatMessage message={buildMessage({
                type: 'ASSISTANT',
                text: 'Done',
                isStreaming: false,
                notifications: ['Step 1', 'Step 2'],
            })} />);
            fireEvent.click(screen.getByRole('button'));
            expect(screen.getByText('Step 1')).toBeDefined();
            expect(screen.getByText('Step 2')).toBeDefined();
        });

        it('collapses step list when toggle is clicked again', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'ASSISTANT',
                text: 'Done',
                isStreaming: false,
                notifications: ['Step 1'],
            })} />);
            const button = screen.getByRole('button');
            fireEvent.click(button);
            fireEvent.click(button);
            expect(container.querySelector('.notification-log-step-list')).toBeNull();
        });

        it('does not render notification log when notifications array is empty', () => {
            const {container} = render(<ChatMessage message={buildMessage({
                type: 'ASSISTANT',
                text: 'Done',
                isStreaming: false,
                notifications: [],
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
});
