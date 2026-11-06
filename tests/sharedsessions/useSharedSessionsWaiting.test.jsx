import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, cleanup, act, fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router';

vi.mock('../../src/service/SharedSessionService.js', () => ({
    default: {
        sessions: vi.fn(),
        incomingInvites: vi.fn(),
    },
}));

vi.mock('../../src/push/usePushNavigation.js', () => ({
    PUSH_NAVIGATED_EVENT: 'push-navigated',
}));

vi.mock('../../src/providers/KeycloakProvider.jsx', () => ({
    useKeycloak: () => ({logout: vi.fn()}),
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {getUsername: vi.fn().mockResolvedValue('Isaac')},
}));

import UserDialog from '../../src/settings/UserDialog.jsx';
import sharedSessionService from '../../src/service/SharedSessionService.js';

async function renderLink() {
    let rendered;

    await act(async () => {
        rendered = render(<MemoryRouter><UserDialog/></MemoryRouter>);
    });

    return rendered.container;
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('shared sessions waiting dot on the user menu', () => {
    it('lists Shared sessions in the user menu', async () => {
        sharedSessionService.sessions.mockResolvedValue([]);
        sharedSessionService.incomingInvites.mockResolvedValue([]);

        const container = await renderLink();
        await act(async () => {
            fireEvent.click(container.querySelector('[data-dialog="User Options"]'));
        });

        expect(container.textContent).toContain('Shared sessions');
        expect(container.querySelector('.shared-sessions-menu-dot')).toBeNull();
    });

    it('shows the dot for an invite from a known agent', async () => {
        sharedSessionService.sessions.mockResolvedValue([]);
        sharedSessionService.incomingInvites.mockResolvedValue([{id: 'invite-1', agentName: 'feud'}]);

        const container = await renderLink();

        expect(container.querySelector('.shared-sessions-link-dot')).not.toBeNull();
    });

    it('shows the dot when a known agent’s session waits on the viewer', async () => {
        sharedSessionService.sessions.mockResolvedValue([{id: 'session-1', agentName: 'feud', yourTurn: true}]);
        sharedSessionService.incomingInvites.mockResolvedValue([]);

        const container = await renderLink();

        expect(container.querySelector('.shared-sessions-link-dot')).not.toBeNull();
    });

    it('ignores sessions and invites the list would not show', async () => {
        sharedSessionService.sessions.mockResolvedValue([{id: 'session-1', agentName: 'weather', yourTurn: true}]);
        sharedSessionService.incomingInvites.mockResolvedValue([{id: 'invite-1', agentName: 'weather'}]);

        const container = await renderLink();

        expect(container.querySelector('.shared-sessions-link-dot')).toBeNull();
    });

    it('shows the dot for an invite into a conversation', async () => {
        sharedSessionService.sessions.mockResolvedValue([]);
        sharedSessionService.incomingInvites.mockResolvedValue([{id: 'invite-1', mode: 'CONVERSATION', agentName: null, sessionName: 'Trip'}]);

        const container = await renderLink();

        expect(container.querySelector('.shared-sessions-link-dot')).not.toBeNull();
    });

    it('ignores yourTurn on a conversation session', async () => {
        sharedSessionService.sessions.mockResolvedValue([{id: 's', mode: 'CONVERSATION', agentName: null, yourTurn: true}]);
        sharedSessionService.incomingInvites.mockResolvedValue([]);

        const container = await renderLink();

        expect(container.querySelector('.shared-sessions-link-dot')).toBeNull();
    });
});
