import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, cleanup, act} from '@testing-library/react';
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

import SharedSessionsLink from '../../src/sharedsessions/SharedSessionsLink.jsx';
import sharedSessionService from '../../src/service/SharedSessionService.js';

async function renderLink() {
    let rendered;

    await act(async () => {
        rendered = render(<MemoryRouter><SharedSessionsLink/></MemoryRouter>);
    });

    return rendered.container;
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('SharedSessionsLink', () => {
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
});
