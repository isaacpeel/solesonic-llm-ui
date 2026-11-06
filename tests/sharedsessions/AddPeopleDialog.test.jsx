import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';

vi.mock('../../src/service/UserDirectoryService.js', () => ({
    default: {search: vi.fn()},
    DIRECTORY_PAGE_SIZE: 20,
}));

vi.mock('../../src/service/SharedSessionService.js', async (importOriginal) => ({
    ...await importOriginal(),
    default: {inviteToSession: vi.fn()},
}));

vi.mock('loglevel', () => ({
    default: {error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()},
}));

import AddPeopleDialog from '../../src/sharedsessions/AddPeopleDialog.jsx';
import {CHAT_HISTORY_PORTAL_ATTRIBUTE} from '../../src/chat/message/ChatRowMenu.jsx';
import sharedSessionService, {SESSION_ERROR_CODES} from '../../src/service/SharedSessionService.js';
import userDirectoryService from '../../src/service/UserDirectoryService.js';
import {ApiError} from '../../src/client/ApiClient.js';

const ALICE = {userId: 'u-alice', username: 'alice', displayName: 'Alice Anders'};
const BOB = {userId: 'u-bob', username: 'bob', displayName: 'Bob Brown'};
const CAROL = {userId: 'u-carol', username: 'carol', displayName: 'Carol Chan'};

let onCancel;
let onInvited;

function renderDialog(props = {}) {
    onCancel = vi.fn();
    onInvited = vi.fn();

    return render(
        <AddPeopleDialog sessionId="session-1" excludeUserIds={['u-bob']} maxPeople={3} onCancel={onCancel} onInvited={onInvited} {...props}/>,
    );
}

const inviteButton = () => screen.getByRole('button', {name: /^Invit/});
const combobox = () => screen.getByRole('combobox');

async function choose(username) {
    fireEvent.focus(combobox());
    fireEvent.click(await screen.findByRole('option', {name: new RegExp(username)}));
}

beforeEach(() => {
    vi.clearAllMocks();
    userDirectoryService.search.mockResolvedValue([ALICE, BOB, CAROL]);
    sharedSessionService.inviteToSession.mockResolvedValue([]);
});

describe('AddPeopleDialog', () => {
    it('is a labelled modal marked as part of the drawer', () => {
        renderDialog();

        const dialog = screen.getByRole('dialog');

        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.getAttribute('aria-labelledby')).toBe(screen.getByRole('heading', {name: 'Add people'}).id);
        expect(dialog.parentElement.hasAttribute(CHAT_HISTORY_PORTAL_ATTRIBUTE)).toBe(true);
    });

    it('leaves out the people already in the chat', async () => {
        renderDialog();
        fireEvent.focus(combobox());

        const options = await screen.findAllByRole('option');

        expect(options.map((option) => option.textContent)).toEqual([
            expect.stringContaining('alice'),
            expect.stringContaining('carol'),
        ]);
    });

    it('keeps Invite disabled until someone is chosen', async () => {
        renderDialog();
        expect(inviteButton().disabled).toBe(true);

        await choose('alice');

        expect(inviteButton().disabled).toBe(false);
    });

    it('stops at the number of seats left', async () => {
        renderDialog({maxPeople: 1});

        await choose('alice');

        expect(screen.getByText('Up to 1 people')).toBeTruthy();
    });

    it('invites the chosen usernames and reports who', async () => {
        renderDialog();
        await choose('alice');
        await choose('carol');

        fireEvent.click(inviteButton());

        await waitFor(() => expect(onInvited).toHaveBeenCalledTimes(1));
        expect(sharedSessionService.inviteToSession).toHaveBeenCalledWith('session-1', ['alice', 'carol']);
        expect(onInvited).toHaveBeenCalledWith([ALICE, CAROL]);
    });

    it('stays open and marks the chip the server could not find', async () => {
        sharedSessionService.inviteToSession.mockRejectedValue(new ApiError({
            message: '404', status: 404, code: SESSION_ERROR_CODES.PARTICIPANT_NOT_FOUND, usernames: ['carol'],
        }));
        renderDialog();
        await choose('alice');
        await choose('carol');

        fireEvent.click(inviteButton());

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('carol');
        expect(screen.getByText('carol').closest('li').getAttribute('data-invalid')).toBe('true');
        expect(onInvited).not.toHaveBeenCalled();
    });

    it('explains when only the owner may invite', async () => {
        sharedSessionService.inviteToSession.mockRejectedValue(new ApiError({
            message: '404', status: 404, code: SESSION_ERROR_CODES.NOT_SESSION_OWNER,
        }));
        renderDialog();
        await choose('alice');

        fireEvent.click(inviteButton());

        expect((await screen.findByRole('alert')).textContent).toMatch(/owner/i);
    });

    it('cancels from the button and on Escape', () => {
        renderDialog();

        fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
        fireEvent.keyDown(combobox(), {key: 'Escape'});

        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('moves focus in and hands it back to the opener', () => {
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
        sharedSessionService.inviteToSession.mockReturnValue(new Promise(() => {}));
        renderDialog();
        await choose('alice');
        fireEvent.click(inviteButton());
        await waitFor(() => expect(inviteButton().disabled).toBe(true));

        fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'});

        expect(onCancel).not.toHaveBeenCalled();
    });

    it('sends only one request however often the form is submitted', async () => {
        sharedSessionService.inviteToSession.mockReturnValue(new Promise(() => {}));
        renderDialog();
        await choose('alice');

        fireEvent.submit(screen.getByRole('dialog'));
        fireEvent.submit(screen.getByRole('dialog'));

        expect(sharedSessionService.inviteToSession).toHaveBeenCalledTimes(1);
    });

    it('keeps rejected chips marked and blocks Invite while any remain', async () => {
        sharedSessionService.inviteToSession.mockRejectedValue(new ApiError({
            message: '404', status: 404, code: SESSION_ERROR_CODES.PARTICIPANT_NOT_FOUND, usernames: ['carol'],
        }));
        renderDialog();
        await choose('alice');
        await choose('carol');
        fireEvent.click(inviteButton());
        await screen.findByRole('alert');

        fireEvent.click(screen.getByRole('button', {name: 'Remove alice'}));

        expect(screen.getByText('carol').closest('li').getAttribute('data-invalid')).toBe('true');
        expect(inviteButton().disabled).toBe(true);
    });

    it('says the chat is full instead of offering a picker when no seats are left', () => {
        renderDialog({maxPeople: 0});

        expect(screen.getByText('This chat is full.')).toBeTruthy();
        expect(screen.queryByRole('combobox')).toBeNull();
        expect(inviteButton().disabled).toBe(true);
    });
});
