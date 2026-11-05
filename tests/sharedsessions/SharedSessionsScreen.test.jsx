import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, waitFor, within} from '@testing-library/react';
import {MemoryRouter} from 'react-router';

vi.mock('../../src/service/SharedSessionService.js', async (importOriginal) => ({
    ...await importOriginal(),
    default: {
        sessions: vi.fn(),
        incomingInvites: vi.fn(),
        outgoingInvites: vi.fn(),
        invite: vi.fn(),
        acceptInvite: vi.fn(),
        declineInvite: vi.fn(),
        cancelInvite: vi.fn(),
        shareConversation: vi.fn(),
    },
}));

vi.mock('../../src/service/UserDirectoryService.js', () => ({
    default: {search: vi.fn()},
    DIRECTORY_PAGE_SIZE: 20,
}));

vi.mock('../../src/service/AuthService.js', () => ({default: {getUserId: vi.fn(), getAccessToken: vi.fn()}}));

vi.mock('react-toastify', () => ({toast: Object.assign(vi.fn(), {error: vi.fn()})}));

vi.mock('loglevel', () => ({
    default: {error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()},
}));

import SharedSessionsScreen from '../../src/sharedsessions/SharedSessionsScreen.jsx';
import sharedSessionService from '../../src/service/SharedSessionService.js';
import userDirectoryService from '../../src/service/UserDirectoryService.js';
import authService from '../../src/service/AuthService.js';

const SAM = {userId: 'u-sam', username: 'sam', displayName: 'Sam Stone'};
const ME = 'u-me';

const CONVERSATION = {
    id: 'session-c',
    mode: 'CONVERSATION',
    agentName: null,
    name: 'Trip planning',
    status: 'ACTIVE',
    updated: '2026-11-05T12:00:00Z',
    participants: [{userId: ME, name: 'Me'}, {userId: 'u-sam', name: 'Sam'}],
};

const FEUD = {
    id: 'session-f',
    mode: 'AGENT',
    agentName: 'feud',
    status: 'ACTIVE',
    yourTurn: true,
    participants: [{userId: ME, name: 'Me'}, {userId: 'u-sam', name: 'Sam'}],
};

async function renderScreen() {
    render(<MemoryRouter><SharedSessionsScreen/></MemoryRouter>);

    await waitFor(() => expect(sharedSessionService.sessions).toHaveBeenCalled());
    await screen.findByText('Your shared sessions');
}

beforeEach(() => {
    vi.clearAllMocks();
    authService.getUserId.mockResolvedValue(ME);
    sharedSessionService.sessions.mockResolvedValue([]);
    sharedSessionService.incomingInvites.mockResolvedValue([]);
    sharedSessionService.outgoingInvites.mockResolvedValue([]);
    userDirectoryService.search.mockResolvedValue([SAM]);
});

describe('SharedSessionsScreen conversations', () => {
    it('lists a conversation by its name, with its own status', async () => {
        sharedSessionService.sessions.mockResolvedValue([CONVERSATION, FEUD, {id: 'x', agentName: 'weather'}]);

        await renderScreen();

        const items = screen.getAllByRole('link');
        expect(items.map((link) => link.textContent)).toEqual([
            'Family Feud with Sam',
            'Trip planning with Sam',
        ]);
        expect(screen.getByText(/^Updated /)).toBeTruthy();
    });

    it('lists an invite into a conversation by the chat name', async () => {
        sharedSessionService.incomingInvites.mockResolvedValue([
            {id: 'i-1', mode: 'CONVERSATION', agentName: null, sessionName: 'Trip planning', inviterUsername: 'sam', inviterDisplayName: 'Sam Stone'},
        ]);

        await renderScreen();

        expect(screen.getByText(/Sam Stone invited you · Shared chat · Trip planning/)).toBeTruthy();
    });

    it('opens the share dialog for a new shared chat', async () => {
        await renderScreen();

        fireEvent.click(screen.getByRole('button', {name: 'Start a shared chat'}));

        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByRole('heading', {name: 'Share this chat'})).toBeTruthy();
    });

    it('shares with no source chat', async () => {
        sharedSessionService.shareConversation.mockResolvedValue({id: 'session-new'});
        await renderScreen();
        fireEvent.click(screen.getByRole('button', {name: 'Start a shared chat'}));
        const dialog = screen.getByRole('dialog');

        fireEvent.focus(within(dialog).getByRole('combobox'));
        fireEvent.click(await within(dialog).findByRole('option', {name: /sam/}));
        fireEvent.click(within(dialog).getByRole('button', {name: 'Share'}));

        await waitFor(() => expect(sharedSessionService.shareConversation).toHaveBeenCalled());
        expect(sharedSessionService.shareConversation).toHaveBeenCalledWith({sourceChatId: null, usernames: ['sam'], name: ''});
    });

    it('closes the dialog on cancel', async () => {
        await renderScreen();
        fireEvent.click(screen.getByRole('button', {name: 'Start a shared chat'}));

        fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));

        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

describe('SharedSessionsScreen agent invite', () => {
    const inviteForm = () => document.querySelector('.shared-sessions-invite-form');

    it('picks the invitee with a single-select user picker', async () => {
        await renderScreen();

        const picker = within(inviteForm()).getByRole('combobox', {name: 'Username'});
        fireEvent.focus(picker);
        fireEvent.click(await within(inviteForm()).findByRole('option', {name: /sam/}));

        expect(within(inviteForm()).getByText('sam')).toBeTruthy();
        expect(within(inviteForm()).getByRole('combobox', {name: 'Username'}).disabled).toBe(true);
        expect(within(inviteForm()).getByText('Up to 1 people')).toBeTruthy();
    });

    it('keeps Invite disabled until someone is picked, then sends the username', async () => {
        sharedSessionService.invite.mockResolvedValue({id: 'i-9'});
        await renderScreen();
        const invite = within(inviteForm()).getByRole('button', {name: 'Invite'});
        expect(invite.disabled).toBe(true);

        fireEvent.focus(within(inviteForm()).getByRole('combobox', {name: 'Username'}));
        fireEvent.click(await within(inviteForm()).findByRole('option', {name: /sam/}));
        expect(invite.disabled).toBe(false);
        fireEvent.click(invite);

        await waitFor(() => expect(sharedSessionService.invite).toHaveBeenCalledWith('sam', 'feud', 'new show'));
        await screen.findByText('Invite sent.');
        expect(inviteForm().querySelector('.user-multi-select-chip')).toBeNull();
    });
});
