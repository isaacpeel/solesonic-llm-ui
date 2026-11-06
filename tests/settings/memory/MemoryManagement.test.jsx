import {render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter, Route, Routes} from 'react-router';
import {describe, it, vi, expect, beforeEach} from 'vitest';

import MemoryManagement from '../../../src/settings/memory/MemoryManagement.jsx';
import {useKeycloak} from '../../../src/providers/KeycloakProvider.jsx';

vi.mock('../../../src/providers/KeycloakProvider.jsx', () => ({
    useKeycloak: vi.fn(),
}));

vi.mock('../../../src/settings/memory/MyMemories.jsx', () => ({
    default: () => <div data-testid="my-memories"/>,
}));

vi.mock('../../../src/settings/memory/AllMemories.jsx', () => ({
    default: () => <div data-testid="all-memories"/>,
}));

vi.mock('../../../src/settings/memory/MemoryReflections.jsx', () => ({
    default: () => <div data-testid="memory-reflections"/>,
}));

vi.mock('../../../src/settings/memory/MemoryStatus.jsx', () => ({
    default: () => <div data-testid="memory-status"/>,
}));

const IZZY_BOT_ADMIN = 'izzy-bot-admin';

function asUser({groups = []} = {}) {
    useKeycloak.mockReturnValue({hasGroup: (groupName) => groups.includes(groupName)});
}

function renderMemory(level) {
    return render(
        <MemoryRouter initialEntries={[`/settings/memory/${level}`]}>
            <Routes>
                <Route path="/settings/memory/:level" element={<MemoryManagement/>}/>
            </Routes>
        </MemoryRouter>
    );
}

const tabs = () => Array.from(document.querySelectorAll('.memory-tab'));

describe('MemoryManagement levels', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows a non-admin no tabs and their own memories', async () => {
        asUser();

        renderMemory('mine');

        await waitFor(() => expect(screen.getByTestId('my-memories')).toBeDefined());
        expect(tabs()).toHaveLength(0);
    });

    it('redirects a non-admin away from an admin level', async () => {
        asUser();

        renderMemory('all');

        await waitFor(() => expect(screen.getByTestId('my-memories')).toBeDefined());
        expect(screen.queryByTestId('all-memories')).toBeNull();
    });

    it('redirects an unknown level to the default level', async () => {
        asUser({groups: [IZZY_BOT_ADMIN]});

        renderMemory('nonsense');

        await waitFor(() => expect(screen.getByTestId('my-memories')).toBeDefined());
    });

    it('shows an admin four tabs, the admin ones badged', async () => {
        asUser({groups: [IZZY_BOT_ADMIN]});

        renderMemory('mine');

        await waitFor(() => expect(tabs()).toHaveLength(4));

        const badged = tabs().map((tab) => Boolean(tab.querySelector('.settings-admin-badge')));
        expect(badged).toEqual([false, true, true, true]);
        expect(tabs()[0].textContent).toContain('My Memory');
    });

    it.each([
        ['all', 'all-memories'],
        ['reflections', 'memory-reflections'],
        ['status', 'memory-status'],
    ])('renders the %s view for an admin', async (level, testId) => {
        asUser({groups: [IZZY_BOT_ADMIN]});

        renderMemory(level);

        await waitFor(() => expect(screen.getByTestId(testId)).toBeDefined());
    });
});
