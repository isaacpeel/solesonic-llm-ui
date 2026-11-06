import {describe, it, expect, vi, afterEach} from 'vitest';
import {createRef} from 'react';
import {render, fireEvent} from '@testing-library/react';
import MessageComposer from '../../src/chat/composer/MessageComposer.jsx';

function renderComposer(props = {}) {
    return render(
        <MessageComposer
            inputRef={createRef()}
            inputValue="hello"
            onInputChange={vi.fn()}
            onSubmit={vi.fn().mockResolvedValue(true)}
            canSubmit={true}
            {...props}
        />
    );
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('MessageComposer', () => {
    it('renders a plain input row with no attach button by default', () => {
        const {container} = renderComposer();

        expect(container.querySelector('.chat-input-row .chat-text-input')).not.toBeNull();
        expect(container.querySelector('.composer-attach-button')).toBeNull();
        expect(container.querySelector('.composer-popovers')).toBeNull();
    });

    it('submits on Enter but not on Shift+Enter', () => {
        const onSubmit = vi.fn().mockResolvedValue(true);
        const {container} = renderComposer({onSubmit});
        const textarea = container.querySelector('.chat-text-input');

        fireEvent.keyDown(textarea, {key: 'Enter', shiftKey: true});
        expect(onSubmit).not.toHaveBeenCalled();

        fireEvent.keyDown(textarea, {key: 'Enter'});
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('does not submit when it cannot', () => {
        const onSubmit = vi.fn().mockResolvedValue(true);
        const {container} = renderComposer({onSubmit, canSubmit: false});

        fireEvent.keyDown(container.querySelector('.chat-text-input'), {key: 'Enter'});
        fireEvent.click(container.querySelector('.composer-send-button'));

        expect(onSubmit).not.toHaveBeenCalled();
        expect(container.querySelector('.composer-send-button').disabled).toBe(true);
    });

    it('lets a key handler claim a key before submission', () => {
        const onSubmit = vi.fn().mockResolvedValue(true);
        const {container} = renderComposer({onSubmit, onKeyDown: () => true});

        fireEvent.keyDown(container.querySelector('.chat-text-input'), {key: 'Enter'});

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('shows stop in place of send and the loader on request', () => {
        const onStop = vi.fn();
        const {container} = renderComposer({onStop, showSend: false, loading: true});

        fireEvent.click(container.querySelector('.composer-stop-button'));

        expect(onStop).toHaveBeenCalledTimes(1);
        expect(container.querySelector('.composer-send-button')).toBeNull();
        expect(container.querySelector('.dots-loader')).not.toBeNull();
    });
});
