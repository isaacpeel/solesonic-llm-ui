import {describe, it, expect} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import ChatNotifications from '../../src/chat/ChatNotifications.jsx';

const MESSAGE_KEY = 'msg-1';

describe('ChatNotifications', () => {
    describe('empty state', () => {
        it('renders nothing when notifications array is empty', () => {
            const {container} = render(
                <ChatNotifications notifications={[]} isStreaming={false} messageKey={MESSAGE_KEY} />
            );
            expect(container.firstChild).toBeNull();
        });
    });

    describe('streaming mode', () => {
        it('shows the last notification as the current step', () => {
            render(
                <ChatNotifications
                    notifications={['Step 1', 'Step 2', 'Step 3']}
                    isStreaming={true}
                    messageKey={MESSAGE_KEY}
                />
            );
            expect(screen.getByText('Step 3')).toBeDefined();
        });

        it('does not show earlier notifications while streaming', () => {
            render(
                <ChatNotifications
                    notifications={['Step 1', 'Step 2']}
                    isStreaming={true}
                    messageKey={MESSAGE_KEY}
                />
            );
            expect(screen.queryByText('Step 1')).toBeNull();
        });

        it('does not render the step list while streaming', () => {
            render(
                <ChatNotifications
                    notifications={['Step 1']}
                    isStreaming={true}
                    messageKey={MESSAGE_KEY}
                />
            );
            expect(screen.queryByRole('list')).toBeNull();
        });

        it('renders the spinner element while streaming', () => {
            const {container} = render(
                <ChatNotifications
                    notifications={['Step 1']}
                    isStreaming={true}
                    messageKey={MESSAGE_KEY}
                />
            );
            expect(container.querySelector('.notification-log-spinner')).not.toBeNull();
        });
    });

    describe('finalized mode', () => {
        it('shows plural step count when there are multiple notifications', () => {
            render(
                <ChatNotifications
                    notifications={['Step 1', 'Step 2']}
                    isStreaming={false}
                    messageKey={MESSAGE_KEY}
                />
            );
            expect(screen.getByText('2 steps completed')).toBeDefined();
        });

        it('uses singular "step" when there is exactly one notification', () => {
            render(
                <ChatNotifications
                    notifications={['Only step']}
                    isStreaming={false}
                    messageKey={MESSAGE_KEY}
                />
            );
            expect(screen.getByText('1 step completed')).toBeDefined();
        });

        it('collapses the step list by default', () => {
            const {container} = render(
                <ChatNotifications
                    notifications={['Step 1']}
                    isStreaming={false}
                    messageKey={MESSAGE_KEY}
                />
            );
            expect(container.querySelector('.notification-log-step-list')).toBeNull();
        });

        it('sets aria-expanded to false when collapsed', () => {
            render(
                <ChatNotifications
                    notifications={['Step 1']}
                    isStreaming={false}
                    messageKey={MESSAGE_KEY}
                />
            );
            expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');
        });

        it('expands the step list when the toggle button is clicked', () => {
            render(
                <ChatNotifications
                    notifications={['Step 1', 'Step 2']}
                    isStreaming={false}
                    messageKey={MESSAGE_KEY}
                />
            );
            fireEvent.click(screen.getByRole('button'));
            expect(screen.getByText('Step 1')).toBeDefined();
            expect(screen.getByText('Step 2')).toBeDefined();
        });

        it('sets aria-expanded to true when expanded', () => {
            render(
                <ChatNotifications
                    notifications={['Step 1']}
                    isStreaming={false}
                    messageKey={MESSAGE_KEY}
                />
            );
            fireEvent.click(screen.getByRole('button'));
            expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
        });

        it('collapses the step list when the toggle button is clicked a second time', () => {
            const {container} = render(
                <ChatNotifications
                    notifications={['Step 1']}
                    isStreaming={false}
                    messageKey={MESSAGE_KEY}
                />
            );
            const button = screen.getByRole('button');
            fireEvent.click(button);
            fireEvent.click(button);
            expect(container.querySelector('.notification-log-step-list')).toBeNull();
        });

        it('aria-controls on the toggle button matches the step list id', () => {
            const {container} = render(
                <ChatNotifications
                    notifications={['Step 1']}
                    isStreaming={false}
                    messageKey={MESSAGE_KEY}
                />
            );
            fireEvent.click(screen.getByRole('button'));
            const button = screen.getByRole('button');
            const list = container.querySelector('.notification-log-step-list');
            expect(button.getAttribute('aria-controls')).toBe(list.id);
        });

        it('renders each notification as a list item when expanded', () => {
            const {container} = render(
                <ChatNotifications
                    notifications={['Alpha', 'Beta', 'Gamma']}
                    isStreaming={false}
                    messageKey={MESSAGE_KEY}
                />
            );
            fireEvent.click(screen.getByRole('button'));
            const items = container.querySelectorAll('.notification-log-step-item');
            expect(items).toHaveLength(3);
            expect(items[0].textContent).toContain('Alpha');
            expect(items[1].textContent).toContain('Beta');
            expect(items[2].textContent).toContain('Gamma');
        });
    });

    describe('seeded vision step', () => {
        it('shows the seeded step while streaming so the pre-token wait is not silent', () => {
            render(
                <ChatNotifications
                    notifications={['Reading 2 images…']}
                    isStreaming={true}
                    messageKey={MESSAGE_KEY}
                />
            );

            expect(screen.getByText('Reading 2 images…')).toBeDefined();
        });

        it('shows the real step once it has replaced the seed', () => {
            render(
                <ChatNotifications
                    notifications={['Reading attached image screenshot.png']}
                    isStreaming={true}
                    messageKey={MESSAGE_KEY}
                />
            );

            expect(screen.getByText('Reading attached image screenshot.png')).toBeDefined();
            expect(screen.queryByText('Reading 2 images…')).toBeNull();
        });

        it('collapses a finished vision run into its step log', () => {
            const {container} = render(
                <ChatNotifications
                    notifications={['Reading attached image one.png', 'Reading attached image two.png']}
                    isStreaming={false}
                    messageKey={MESSAGE_KEY}
                />
            );

            fireEvent.click(screen.getByRole('button'));
            const items = container.querySelectorAll('.notification-log-step-item');

            expect(items).toHaveLength(2);
            expect(items[0].textContent).toContain('Reading attached image one.png');
        });
    });
});
