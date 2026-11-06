import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';

vi.mock('../../src/service/UserDirectoryService.js', () => ({
    default: {search: vi.fn()},
    DIRECTORY_PAGE_SIZE: 20,
}));

vi.mock('../../src/service/SharedSessionService.js', async (importOriginal) => ({
    ...await importOriginal(),
    default: {shareConversation: vi.fn()},
}));

vi.mock('react-toastify', () => ({
    toast: Object.assign(vi.fn(), {error: vi.fn()}),
}));

vi.mock('loglevel', () => ({
    default: {error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()},
}));

const navigateSpy = vi.fn();

vi.mock('react-router', async (importOriginal) => ({
    ...await importOriginal(),
    useNavigate: () => navigateSpy,
}));

import ShareChatDialog from '../../src/sharedsessions/ShareChatDialog.jsx';
import {CHAT_HISTORY_PORTAL_ATTRIBUTE} from '../../src/chat/message/ChatRowMenu.jsx';
import sharedSessionService, {SESSION_ERROR_CODES} from '../../src/service/SharedSessionService.js';
import userDirectoryService from '../../src/service/UserDirectoryService.js';
import {ApiError} from '../../src/client/ApiClient.js';
import {toast} from 'react-toastify';

const ALICE = {userId: 'u-alice', username: 'alice', displayName: 'Alice Anders'};
const BOB = {userId: 'u-bob', username: 'bob', displayName: 'Bob Brown'};

let onCancel;
let onShared;

function renderDialog(props = {}) {
    onCancel = vi.fn();
    onShared = vi.fn();

    return render(
        <ShareChatDialog sourceChatId="chat-1" chatName="Trip planning" onCancel={onCancel} onShared={onShared} {...props}/>,
    );
}

const shareButton = () => screen.getByRole('button', {name: /^Shar/});
const nameInput = () => screen.getByLabelText('Chat name');
const combobox = () => screen.getByRole('combobox');

async function choose(username) {
    fireEvent.focus(combobox());
    const option = await screen.findByRole('option', {name: new RegExp(username)});
    fireEvent.click(option);
}

beforeEach(() => {
    vi.clearAllMocks();
    userDirectoryService.search.mockResolvedValue([ALICE, BOB]);
    sharedSessionService.shareConversation.mockResolvedValue({id: 'session-9'});
});

describe('ShareChatDialog', () => {
    it('is a labelled modal dialog portalled out of the drawer, marked as part of it', () => {
        renderDialog();

        const dialog = screen.getByRole('dialog');

        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(screen.getByRole('heading', {name: 'Share this chat'})).toBeTruthy();
        expect(dialog.getAttribute('aria-labelledby')).toBe(screen.getByRole('heading').id);
        expect(dialog.parentElement.hasAttribute(CHAT_HISTORY_PORTAL_ATTRIBUTE)).toBe(true);
        expect(dialog.closest('body > div')).not.toBeNull();
    });

    it('pre-fills the name with the chat name', () => {
        renderDialog();

        expect(nameInput().value).toBe('Trip planning');
    });

    it('says what is and is not shared', () => {
        renderDialog();

        expect(screen.getByText(/Attachments and images aren't shared/)).toBeTruthy();
        expect(screen.getByText(/original chat stays private/)).toBeTruthy();
    });

    it('keeps Share disabled until someone is chosen', async () => {
        renderDialog();

        expect(shareButton().disabled).toBe(true);

        await choose('alice');

        expect(shareButton().disabled).toBe(false);
    });

    it('allows up to seven other people', async () => {
        const people = Array.from({length: 8}, (unused, index) => ({userId: `u-${index}`, username: `user${index}`, displayName: `User ${index}`}));
        userDirectoryService.search.mockResolvedValue(people);
        renderDialog();

        for (let count = 0; count < 7; count += 1) {
            fireEvent.focus(combobox());
            fireEvent.click((await screen.findAllByRole('option'))[0]);
        }

        expect(screen.getByText('Up to 7 people')).toBeTruthy();
        expect(combobox().disabled).toBe(true);
    });

    it('posts the chosen usernames, the source chat and the name', async () => {
        renderDialog();
        await choose('alice');
        await choose('bob');
        fireEvent.change(nameInput(), {target: {value: '  Holiday  '}});

        fireEvent.click(shareButton());

        await waitFor(() => expect(sharedSessionService.shareConversation).toHaveBeenCalledTimes(1));
        expect(sharedSessionService.shareConversation).toHaveBeenCalledWith({
            sourceChatId: 'chat-1',
            usernames: ['alice', 'bob'],
            name: 'Holiday',
        });
    });

    it('sends a null source chat when sharing a new chat', async () => {
        renderDialog({sourceChatId: null, chatName: ''});
        await choose('alice');

        fireEvent.click(shareButton());

        await waitFor(() => expect(sharedSessionService.shareConversation).toHaveBeenCalled());
        expect(sharedSessionService.shareConversation).toHaveBeenCalledWith({sourceChatId: null, usernames: ['alice'], name: ''});
    });

    it('navigates to the new session, thanks the user and reports it on success', async () => {
        renderDialog();
        await choose('alice');
        await choose('bob');

        fireEvent.click(shareButton());

        await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/shared-sessions/session-9'));
        expect(toast).toHaveBeenCalledWith('Invites sent to alice, bob');
        expect(onShared).toHaveBeenCalledWith({id: 'session-9'});
    });

    it('disables the form while the request is in flight', async () => {
        sharedSessionService.shareConversation.mockReturnValue(new Promise(() => {}));
        renderDialog();
        await choose('alice');

        fireEvent.click(shareButton());

        await waitFor(() => expect(shareButton().disabled).toBe(true));
        expect(nameInput().disabled).toBe(true);
        expect(screen.getByRole('button', {name: 'Cancel'}).disabled).toBe(true);
    });

    it('stays open and marks the chips the server could not find', async () => {
        sharedSessionService.shareConversation.mockRejectedValue(new ApiError({
            message: '404', status: 404, code: SESSION_ERROR_CODES.PARTICIPANT_NOT_FOUND, usernames: ['bob'],
        }));
        renderDialog();
        await choose('alice');
        await choose('bob');

        fireEvent.click(shareButton());

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('bob');
        expect(screen.getByText('bob').closest('li').getAttribute('data-invalid')).toBe('true');
        expect(screen.getByText('alice').closest('li').hasAttribute('data-invalid')).toBe(false);
        expect(navigateSpy).not.toHaveBeenCalled();
        expect(onShared).not.toHaveBeenCalled();
        expect(shareButton().disabled).toBe(true);
    });

    it('shows other refusals in plain words and keeps what was typed', async () => {
        sharedSessionService.shareConversation.mockRejectedValue(new ApiError({
            message: '409', status: 409, code: SESSION_ERROR_CODES.CHAT_STREAMING,
        }));
        renderDialog();
        await choose('alice');

        fireEvent.click(shareButton());

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toMatch(/finish/i);
        expect(screen.getByText('alice')).toBeTruthy();
        expect(nameInput().value).toBe('Trip planning');
    });

    it('cancels from the button', () => {
        renderDialog();

        fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));

        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('cancels on Escape', () => {
        renderDialog();

        fireEvent.keyDown(nameInput(), {key: 'Escape'});

        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('wraps Tab from the last control to the first and Shift+Tab back', () => {
        renderDialog();
        const cancel = screen.getByRole('button', {name: 'Cancel'});

        nameInput().focus();
        fireEvent.keyDown(nameInput(), {key: 'Tab', shiftKey: true});
        expect(document.activeElement).toBe(cancel);

        fireEvent.keyDown(cancel, {key: 'Tab'});
        expect(document.activeElement).toBe(nameInput());
    });

    it('moves focus into the dialog and gives it back to the opener on close', () => {
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();

        const {unmount} = renderDialog();

        expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);

        unmount();

        expect(document.activeElement).toBe(opener);

        opener.remove();
    });

    it('ignores Escape while the request is in flight', async () => {
        sharedSessionService.shareConversation.mockReturnValue(new Promise(() => {}));
        renderDialog();
        await choose('alice');
        fireEvent.click(shareButton());
        await waitFor(() => expect(shareButton().disabled).toBe(true));

        fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'});

        expect(onCancel).not.toHaveBeenCalled();
    });

    it('sends only one request however often the form is submitted', async () => {
        sharedSessionService.shareConversation.mockReturnValue(new Promise(() => {}));
        renderDialog();
        await choose('alice');

        fireEvent.submit(screen.getByRole('dialog'));
        fireEvent.submit(screen.getByRole('dialog'));

        expect(sharedSessionService.shareConversation).toHaveBeenCalledTimes(1);
    });

    it('keeps the other rejected chips marked when one is edited, and blocks Share while any remain', async () => {
        sharedSessionService.shareConversation.mockRejectedValue(new ApiError({
            message: '404', status: 404, code: SESSION_ERROR_CODES.PARTICIPANT_NOT_FOUND, usernames: ['alice', 'bob'],
        }));
        renderDialog();
        await choose('alice');
        await choose('bob');
        fireEvent.click(shareButton());
        await screen.findByRole('alert');

        fireEvent.click(screen.getByRole('button', {name: 'Remove alice'}));

        expect(screen.getByText('bob').closest('li').getAttribute('data-invalid')).toBe('true');
        expect(shareButton().disabled).toBe(true);

        fireEvent.click(screen.getByRole('button', {name: 'Remove bob'}));
        await choose('alice');
        expect(shareButton().disabled).toBe(false);
    });

    it('warns that earlier replies, including ones that used personal tools, are copied', () => {
        renderDialog();

        const note = document.querySelector('.share-chat-note').textContent;

        expect(note).toContain('up to 500');
        expect(note).toContain('your email, Jira or personal notes');
        expect(note).toContain("Attachments and images aren't shared");
    });

    it('leaves the copied-messages warning out for a new chat', () => {
        renderDialog({sourceChatId: null, chatName: ''});

        const note = document.querySelector('.share-chat-note').textContent;

        expect(note).not.toContain('up to 500');
        expect(note).not.toContain('Jira');
    });
});
