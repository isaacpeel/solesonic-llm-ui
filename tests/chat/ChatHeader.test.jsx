import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, fireEvent, cleanup, screen} from '@testing-library/react';
import ChatHeader from '../../src/chat/header/ChatHeader.jsx';

afterEach(() => {
    cleanup();
});

function renderHeader(rename) {
    return render(<ChatHeader title="My wife and I both use Google fit" rename={rename}/>);
}

describe('ChatHeader rename', () => {
    it('renders a plain title when rename is not offered', () => {
        renderHeader(undefined);

        expect(screen.queryByRole('button', {name: /Rename conversation/})).toBeNull();
        expect(screen.getByRole('heading').textContent).toBe('My wife and I both use Google fit');
    });

    it('turns the title into a field with save and cancel on tap', () => {
        renderHeader({initialValue: '', placeholder: 'first message', onRename: vi.fn()});

        fireEvent.click(screen.getByRole('button', {name: /Rename conversation/}));

        expect(screen.getByLabelText('Conversation name')).toBe(document.activeElement);
        expect(screen.getByRole('button', {name: 'Save name'})).toBeTruthy();
        expect(screen.getByRole('button', {name: 'Cancel rename'})).toBeTruthy();
    });

    it('saves the trimmed name with the check', () => {
        const onRename = vi.fn();
        renderHeader({initialValue: 'Old', onRename});

        fireEvent.click(screen.getByRole('button', {name: /Rename conversation/}));
        fireEvent.change(screen.getByLabelText('Conversation name'), {target: {value: '  Heart points  '}});
        fireEvent.click(screen.getByRole('button', {name: 'Save name'}));

        expect(onRename).toHaveBeenCalledWith('Heart points');
        expect(screen.queryByLabelText('Conversation name')).toBeNull();
    });

    it('saves on Enter', () => {
        const onRename = vi.fn();
        renderHeader({initialValue: '', onRename});

        fireEvent.click(screen.getByRole('button', {name: /Rename conversation/}));
        fireEvent.change(screen.getByLabelText('Conversation name'), {target: {value: 'Walk'}});
        fireEvent.keyDown(screen.getByLabelText('Conversation name'), {key: 'Enter'});

        expect(onRename).toHaveBeenCalledWith('Walk');
    });

    it('discards the edit with the x or Escape', () => {
        const onRename = vi.fn();
        renderHeader({initialValue: 'Old', onRename});

        fireEvent.click(screen.getByRole('button', {name: /Rename conversation/}));
        fireEvent.change(screen.getByLabelText('Conversation name'), {target: {value: 'New'}});
        fireEvent.click(screen.getByRole('button', {name: 'Cancel rename'}));

        fireEvent.click(screen.getByRole('button', {name: /Rename conversation/}));
        fireEvent.keyDown(screen.getByLabelText('Conversation name'), {key: 'Escape'});

        expect(onRename).not.toHaveBeenCalled();
        expect(screen.queryByLabelText('Conversation name')).toBeNull();
    });

    it('sends nothing for a blank or unchanged name', () => {
        const onRename = vi.fn();
        renderHeader({initialValue: 'Old', onRename});

        fireEvent.click(screen.getByRole('button', {name: /Rename conversation/}));
        fireEvent.change(screen.getByLabelText('Conversation name'), {target: {value: '   '}});
        fireEvent.click(screen.getByRole('button', {name: 'Save name'}));

        fireEvent.click(screen.getByRole('button', {name: /Rename conversation/}));
        fireEvent.click(screen.getByRole('button', {name: 'Save name'}));

        expect(onRename).not.toHaveBeenCalled();
    });
});
