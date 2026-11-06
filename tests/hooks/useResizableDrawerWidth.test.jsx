import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {render, fireEvent, cleanup, act} from '@testing-library/react';
import useResizableDrawerWidth, {DEFAULT_DRAWER_WIDTH, MINIMUM_DRAWER_WIDTH} from '../../src/hooks/useResizableDrawerWidth.js';

function Harness() {
    const resizer = useResizableDrawerWidth();

    return <div data-testid="handle" data-width={resizer.width} tabIndex={0} {...resizer.handleProps}/>;
}

function widthOf(container) {
    return Number(container.querySelector('[data-testid="handle"]').dataset.width);
}

function cssWidth() {
    return document.documentElement.style.getPropertyValue('--chat-drawer-width');
}

beforeEach(() => {
    window.localStorage.clear();
    window.innerWidth = 1200;
});

afterEach(() => {
    cleanup();
    document.documentElement.style.removeProperty('--chat-drawer-width');
});

describe('useResizableDrawerWidth', () => {
    it('starts at the default width and publishes it as a CSS variable', () => {
        const {container} = render(<Harness/>);

        expect(widthOf(container)).toBe(DEFAULT_DRAWER_WIDTH);
        expect(cssWidth()).toBe(`${DEFAULT_DRAWER_WIDTH}px`);
    });

    it('follows a drag and remembers the width', () => {
        const {container} = render(<Harness/>);
        const handle = container.querySelector('[data-testid="handle"]');

        fireEvent.pointerDown(handle, {clientX: 250, button: 0, pointerId: 1});
        fireEvent.pointerMove(handle, {clientX: 400, pointerId: 1});
        fireEvent.pointerUp(handle, {clientX: 400, pointerId: 1});

        expect(widthOf(container)).toBe(400);
        expect(cssWidth()).toBe('400px');
        expect(window.localStorage.getItem('chatHistoryDrawerWidth')).toBe('400');
    });

    it('clamps to the minimum and to the viewport', () => {
        const {container} = render(<Harness/>);
        const handle = container.querySelector('[data-testid="handle"]');

        fireEvent.pointerDown(handle, {clientX: 250, button: 0, pointerId: 1});
        fireEvent.pointerMove(handle, {clientX: 0, pointerId: 1});
        expect(widthOf(container)).toBe(MINIMUM_DRAWER_WIDTH);

        act(() => {
            window.innerWidth = 400;
        });
        fireEvent.pointerMove(handle, {clientX: 2000, pointerId: 1});
        fireEvent.pointerUp(handle, {pointerId: 1});
        expect(widthOf(container)).toBe(360);
    });

    it('restores a stored width', () => {
        window.localStorage.setItem('chatHistoryDrawerWidth', '320');

        const {container} = render(<Harness/>);

        expect(widthOf(container)).toBe(320);
    });

    it('resizes with the arrow keys', () => {
        const {container} = render(<Harness/>);
        const handle = container.querySelector('[data-testid="handle"]');

        fireEvent.keyDown(handle, {key: 'ArrowRight'});

        expect(widthOf(container)).toBe(DEFAULT_DRAWER_WIDTH + 16);
    });
});
