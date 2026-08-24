import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, fireEvent, waitFor} from '@testing-library/react';

vi.mock('../../src/service/ChatService.js', () => ({
    default: {
        deleteChat: vi.fn(),
    },
    DEFAULT_CHAT_HISTORY_PAGE_SIZE: 20,
}));

vi.mock('loglevel', () => ({
    default: {error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()},
}));

import DeleteChatDialog from '../../src/chat/DeleteChatDialog.jsx';
import chatService from '../../src/service/ChatService.js';

/* The dialog is portalled to document.body, so it is never inside the render container. */
function renderDialog({label = 'Trip planning', streaming = false} = {}) {
    const onCancel = vi.fn();
    const onDeleted = vi.fn();

    const {rerender} = render(
        <DeleteChatDialog
            chatId="chat-1"
            label={label}
            streaming={streaming}
            onCancel={onCancel}
            onDeleted={onDeleted}
        />
    );

    /* Re-renders with the same handlers, so a prop can change while the dialog stays open. */
    function rerenderWith(nextProps) {
        rerender(
            <DeleteChatDialog
                chatId="chat-1"
                label={label}
                streaming={streaming}
                onCancel={onCancel}
                onDeleted={onDeleted}
                {...nextProps}
            />
        );
    }

    return {onCancel, onDeleted, rerenderWith};
}

function dialog() {
    return document.body.querySelector('.delete-chat-dialog');
}

function confirmButton() {
    return document.body.querySelector('.delete-chat-dialog-confirm');
}

function cancelButton() {
    return document.body.querySelector('.delete-chat-dialog-cancel');
}

beforeEach(() => {
    chatService.deleteChat.mockReset();
    chatService.deleteChat.mockResolvedValue(null);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('DeleteChatDialog', () => {
    it('names the conversation and states that the delete cannot be undone', () => {
        renderDialog({label: 'Trip planning'});

        const body = document.body.querySelector('.delete-chat-dialog-body').textContent;

        expect(document.body.querySelector('.delete-chat-dialog-title').textContent)
            .toBe('Delete conversation?');
        expect(body).toContain('"Trip planning"');
        expect(body).toContain('messages, attachments, and generated images');
        expect(body).toContain('This cannot be undone.');
    });

    it('renders the untruncated label, however long it is', () => {
        const longLabel = 'x'.repeat(120);

        renderDialog({label: longLabel});

        expect(document.body.querySelector('.delete-chat-dialog-label').textContent)
            .toBe(`"${longLabel}"`);
    });

    it('is a modal dialog labelled by its title', () => {
        renderDialog();

        expect(dialog().getAttribute('role')).toBe('dialog');
        expect(dialog().getAttribute('aria-modal')).toBe('true');
        expect(dialog().getAttribute('aria-labelledby')).toBe('delete-chat-dialog-title');
    });

    /* The safe answer for an irreversible action is the one Enter lands on. */
    it('opens with Cancel focused', () => {
        renderDialog();

        expect(document.activeElement).toBe(cancelButton());
    });

    it('cancels without issuing a request', () => {
        const {onCancel, onDeleted} = renderDialog();

        fireEvent.click(cancelButton());

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(chatService.deleteChat).not.toHaveBeenCalled();
        expect(onDeleted).not.toHaveBeenCalled();
    });

    it('cancels on Escape without issuing a request', () => {
        const {onCancel} = renderDialog();

        fireEvent.keyDown(document.body.querySelector('.delete-chat-backdrop'), {key: 'Escape'});

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(chatService.deleteChat).not.toHaveBeenCalled();
    });

    it('deletes once and reports it', async () => {
        const {onDeleted} = renderDialog();

        fireEvent.click(confirmButton());

        await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('chat-1'));
        expect(chatService.deleteChat).toHaveBeenCalledTimes(1);
        expect(chatService.deleteChat).toHaveBeenCalledWith('chat-1');
        expect(document.body.querySelector('.delete-chat-dialog-error')).toBeNull();
    });

    /* A repeat is a 404 rather than a 204: the conversation is gone, which is what was asked for. */
    it('treats a 404 as already deleted, with no error', async () => {
        chatService.deleteChat.mockRejectedValue(Object.assign(new Error('404'), {status: 404}));

        const {onDeleted} = renderDialog();

        fireEvent.click(confirmButton());

        await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('chat-1'));
        expect(document.body.querySelector('.delete-chat-dialog-error')).toBeNull();
    });

    it('keeps the dialog open and explains any other failure', async () => {
        chatService.deleteChat.mockRejectedValue(Object.assign(new Error('500'), {status: 500}));

        const {onDeleted} = renderDialog();

        fireEvent.click(confirmButton());

        await waitFor(() => expect(document.body.querySelector('.delete-chat-dialog-error')).not.toBeNull());
        expect(document.body.querySelector('.delete-chat-dialog-error').textContent)
            .toBe('Could not delete the conversation. Please try again.');
        expect(dialog()).not.toBeNull();
        expect(onDeleted).not.toHaveBeenCalled();
        /* Re-armed, so the user can try again without reopening the dialog. */
        expect(confirmButton().disabled).toBe(false);
        expect(cancelButton().disabled).toBe(false);
    });

    it('disables both buttons while the request is in flight', async () => {
        chatService.deleteChat.mockImplementation(() => new Promise(() => {
        }));

        renderDialog();

        fireEvent.click(confirmButton());

        await waitFor(() => expect(confirmButton().textContent).toBe('Deleting…'));
        expect(confirmButton().disabled).toBe(true);
        expect(cancelButton().disabled).toBe(true);
    });

    it('does not issue a second request while the first is in flight', async () => {
        chatService.deleteChat.mockImplementation(() => new Promise(() => {
        }));

        renderDialog();

        fireEvent.click(confirmButton());
        fireEvent.click(confirmButton());

        expect(chatService.deleteChat).toHaveBeenCalledTimes(1);
    });

    /* The backend runs an in-flight turn to completion; it would write onto a deleted chat. */
    it('refuses a conversation that is already streaming when it opens', () => {
        const {onDeleted} = renderDialog({streaming: true});

        expect(confirmButton().disabled).toBe(true);
        expect(confirmButton().getAttribute('title')).toBe('Wait for the response to finish.');

        fireEvent.click(confirmButton());

        expect(chatService.deleteChat).not.toHaveBeenCalled();
        expect(onDeleted).not.toHaveBeenCalled();
    });

    it('refuses once a turn starts after it opened', () => {
        const {onDeleted, rerenderWith} = renderDialog({streaming: false});

        expect(confirmButton().disabled).toBe(false);

        rerenderWith({streaming: true});

        expect(confirmButton().disabled).toBe(true);

        fireEvent.click(confirmButton());

        expect(chatService.deleteChat).not.toHaveBeenCalled();
        expect(onDeleted).not.toHaveBeenCalled();
    });

    it('returns focus to whatever opened it', () => {
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();

        const {unmount} = render(
            <DeleteChatDialog
                chatId="chat-1"
                label="Trip planning"
                streaming={false}
                onCancel={vi.fn()}
                onDeleted={vi.fn()}
            />
        );

        expect(document.activeElement).toBe(cancelButton());

        unmount();

        expect(document.activeElement).toBe(opener);
        opener.remove();
    });
});
