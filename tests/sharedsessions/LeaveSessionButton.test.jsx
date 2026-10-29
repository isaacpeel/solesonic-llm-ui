import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, fireEvent, act} from '@testing-library/react';
import LeaveSessionButton from '../../src/sharedsessions/LeaveSessionButton.jsx';

function openConfirm(container) {
    fireEvent.click(container.querySelector('.leave-session-trigger'));
}

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe('LeaveSessionButton', () => {
    it('starts as a single icon button', () => {
        const {container} = render(<LeaveSessionButton onConfirm={vi.fn()}/>);

        expect(container.querySelector('.leave-session-trigger').getAttribute('aria-label')).toBe('Leave session');
        expect(container.querySelector('.leave-session-confirm')).toBeNull();
    });

    it('asks before ending and focuses the safe choice', () => {
        const onConfirm = vi.fn();
        const {container} = render(<LeaveSessionButton onConfirm={onConfirm}/>);

        openConfirm(container);

        expect(container.querySelector('.leave-session-confirm-text').textContent).toBe('End for everyone?');
        expect(document.activeElement.getAttribute('aria-label')).toBe('Keep the session');
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('ends the session on confirm', async () => {
        const onConfirm = vi.fn().mockResolvedValue(undefined);
        const {container} = render(<LeaveSessionButton onConfirm={onConfirm}/>);

        openConfirm(container);

        await act(async () => {
            fireEvent.click(container.querySelector('.leave-session-icon-button--danger'));
        });

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(container.querySelector('.leave-session-trigger')).not.toBeNull();
    });

    it('collapses back on cancel and returns focus to the icon', () => {
        const {container} = render(<LeaveSessionButton onConfirm={vi.fn()}/>);

        openConfirm(container);
        fireEvent.click(container.querySelector('[aria-label="Keep the session"]'));

        expect(container.querySelector('.leave-session-confirm')).toBeNull();
        expect(document.activeElement).toBe(container.querySelector('.leave-session-trigger'));
    });

    it('collapses on Escape and on a tap elsewhere', () => {
        const {container} = render(<LeaveSessionButton onConfirm={vi.fn()}/>);

        openConfirm(container);
        fireEvent.keyDown(document, {key: 'Escape'});
        expect(container.querySelector('.leave-session-confirm')).toBeNull();

        openConfirm(container);
        fireEvent.pointerDown(document.body);
        expect(container.querySelector('.leave-session-confirm')).toBeNull();
    });

    it('collapses on its own after a few seconds', () => {
        vi.useFakeTimers();
        const {container} = render(<LeaveSessionButton onConfirm={vi.fn()}/>);

        openConfirm(container);

        act(() => {
            vi.advanceTimersByTime(5000);
        });

        expect(container.querySelector('.leave-session-confirm')).toBeNull();
    });
});
