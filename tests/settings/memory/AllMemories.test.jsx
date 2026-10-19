import {render, screen, waitFor, fireEvent, within, act} from '@testing-library/react';
import {MemoryRouter, Route, Routes} from 'react-router';
import {describe, it, vi, expect, beforeEach} from 'vitest';

import AllMemories from '../../../src/settings/memory/AllMemories.jsx';
import {useKeycloak} from '../../../src/providers/KeycloakProvider.jsx';

vi.mock('../../../src/providers/KeycloakProvider.jsx', () => ({
    useKeycloak: vi.fn(),
}));

vi.mock('../../../src/service/MemoryService.js', () => ({
    default: {
        findAllMemories: vi.fn(),
        updateMemory: vi.fn(),
        deleteMemory: vi.fn(),
    },
}));

import memoryService from '../../../src/service/MemoryService.js';

let liveObservers = new Set();

class FakeIntersectionObserver {
    constructor(callback) {
        this.callback = callback;
    }

    observe() {
        liveObservers.add(this);
    }

    unobserve() {
        liveObservers.delete(this);
    }

    disconnect() {
        liveObservers.delete(this);
    }
}

vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

const scrollToSentinel = async () => {
    await act(async () => {
        liveObservers.forEach((observer) => observer.callback([{isIntersecting: true}]));
    });
};

const ADMIN_USER_ID = 'admin-1';

const memory = (overrides) => ({
    id: 'memory-1',
    userId: 'user-9',
    memoryKey: 'home-city',
    supersedes: null,
    kind: 'FACT',
    origin: 'INFERRED',
    status: 'ACTIVE',
    content: 'Lives in Denver',
    confidence: 0.85,
    created: '2026-10-01T12:00:00Z',
    updated: '2026-10-10T12:00:00Z',
    lastConfirmed: '2026-10-16T12:00:00Z',
    chatIds: ['chat-1'],
    ...overrides,
});

const paged = (content, {number = 0, totalPages = 1} = {}) => ({
    content,
    page: {size: 50, number, totalElements: content.length, totalPages},
});

const forbidden = () => {
    const caughtError = new Error('403: GET - /memories Forbidden');
    caughtError.status = 403;
    return caughtError;
};

function renderAllMemories(search = '') {
    return render(
        <MemoryRouter initialEntries={[`/settings/memory/all${search}`]}>
            <Routes>
                <Route path="/settings/memory/:level" element={<AllMemories/>}/>
            </Routes>
        </MemoryRouter>
    );
}

const rowContents = () => Array.from(document.querySelectorAll('.memory-row-content'))
    .map((content) => content.textContent.trim());

const rowFor = (content) => screen.getByText(content).closest('.memory-row');

const lastFilters = () => memoryService.findAllMemories.mock.calls.at(-1)[0];

beforeEach(() => {
    liveObservers = new Set();
    vi.clearAllMocks();
    useKeycloak.mockReturnValue({
        keycloak: {tokenParsed: {sub: ADMIN_USER_ID}},
        hasGroup: () => true,
    });
});

describe('AllMemories filters', () => {
    it('sends no filters by default', async () => {
        memoryService.findAllMemories.mockResolvedValue(paged([]));

        renderAllMemories();

        await waitFor(() => expect(memoryService.findAllMemories).toHaveBeenCalled());

        expect(memoryService.findAllMemories).toHaveBeenCalledWith(
            {userId: undefined, statuses: [], kinds: [], sorts: []},
            0,
        );
    });

    it('reads its filters from the URL', async () => {
        memoryService.findAllMemories.mockResolvedValue(paged([]));

        renderAllMemories('?userId=user-9&status=ACTIVE&status=PENDING&kind=FACT&sort=user');

        await waitFor(() => expect(memoryService.findAllMemories).toHaveBeenCalled());

        expect(memoryService.findAllMemories).toHaveBeenCalledWith(
            {
                userId: 'user-9',
                statuses: ['ACTIVE', 'PENDING'],
                kinds: ['FACT'],
                sorts: ['userId,asc', 'updated,desc'],
            },
            0,
        );
        expect(screen.getByLabelText('User ID').value).toBe('user-9');
        expect(screen.getByRole('checkbox', {name: 'Superseded'}).checked).toBe(false);
    });

    it('starts paging over when a filter changes', async () => {
        memoryService.findAllMemories.mockImplementation(async (filters, page) => {
            if (filters.statuses.length > 0) {
                return paged([memory({id: 'memory-9', content: 'Filtered memory'})]);
            }

            return paged(
                [memory({id: `memory-${page}`, content: `Memory page ${page}`})],
                {number: page, totalPages: 2},
            );
        });

        renderAllMemories();

        await waitFor(() => expect(rowContents()).toEqual(['Memory page 0']));

        await scrollToSentinel();

        await waitFor(() => expect(rowContents()).toEqual(['Memory page 0', 'Memory page 1']));

        fireEvent.click(screen.getByRole('checkbox', {name: 'Superseded'}));

        await waitFor(() => expect(rowContents()).toEqual(['Filtered memory']));
        expect(lastFilters().statuses).toEqual(['ACTIVE', 'PENDING']);
        expect(memoryService.findAllMemories.mock.calls.at(-1)[1]).toBe(0);
    });

    it('applies a typed user id', async () => {
        memoryService.findAllMemories.mockResolvedValue(paged([]));

        renderAllMemories();

        await waitFor(() => expect(memoryService.findAllMemories).toHaveBeenCalled());

        fireEvent.change(screen.getByLabelText('User ID'), {target: {value: '  user-42  '}});
        fireEvent.click(screen.getByRole('button', {name: 'Apply'}));

        await waitFor(() => expect(lastFilters().userId).toBe('user-42'));
    });

    it('filters to a user when their id is clicked on a row', async () => {
        memoryService.findAllMemories.mockResolvedValue(paged([memory()]));

        renderAllMemories();

        await waitFor(() => expect(rowFor('Lives in Denver')).not.toBeNull());

        fireEvent.click(within(rowFor('Lives in Denver')).getByTitle('user-9'));

        await waitFor(() => expect(lastFilters().userId).toBe('user-9'));
        expect(screen.getByLabelText('User ID').value).toBe('user-9');
    });

    it('sends the sort chosen in the select', async () => {
        memoryService.findAllMemories.mockResolvedValue(paged([]));

        renderAllMemories();

        await waitFor(() => expect(memoryService.findAllMemories).toHaveBeenCalled());

        fireEvent.change(screen.getByLabelText('Sort'), {target: {value: 'confidence'}});

        await waitFor(() => expect(lastFilters().sorts).toEqual(['confidence,desc']));
    });
});

describe('AllMemories rows', () => {
    it('shows admin columns and dims superseded rows without actions', async () => {
        memoryService.findAllMemories.mockResolvedValue(paged([
            memory({id: 'memory-1', content: 'Lives in Boulder', supersedes: 'memory-0-abcdef'}),
            memory({id: 'memory-0', content: 'Lives in Denver', status: 'SUPERSEDED', memoryKey: null}),
        ]));

        renderAllMemories();

        await waitFor(() => expect(rowContents()).toHaveLength(2));

        const supersededRow = rowFor('Lives in Denver');
        expect(supersededRow.className).toContain('memory-row-superseded');
        expect(within(supersededRow).queryByRole('button', {name: 'Edit'})).toBeNull();
        expect(within(supersededRow).queryByRole('button', {name: 'Delete'})).toBeNull();
        expect(within(supersededRow).getByText('Superseded')).toBeDefined();
        expect(within(supersededRow).getByText('—')).toBeDefined();

        const currentRow = rowFor('Lives in Boulder');
        expect(within(currentRow).getByText('home-city')).toBeDefined();
        expect(within(currentRow).getByTitle('memory-0-abcdef')).toBeDefined();
        expect(within(currentRow).getByRole('button', {name: 'Edit'})).toBeDefined();
    });

    it('offers no actions on a row whose owner is unknown', async () => {
        memoryService.findAllMemories.mockResolvedValue(paged([memory({userId: null})]));

        renderAllMemories();

        await waitFor(() => expect(rowFor('Lives in Denver')).not.toBeNull());

        expect(within(rowFor('Lives in Denver')).queryByRole('button', {name: 'Edit'})).toBeNull();
        expect(within(rowFor('Lives in Denver')).queryByRole('button', {name: 'Delete'})).toBeNull();
    });

    it('keeps the row owner when the save response names a different user', async () => {
        memoryService.findAllMemories.mockResolvedValue(paged([memory()]));
        memoryService.updateMemory.mockResolvedValue(memory({userId: 'someone-else', content: 'Lives in Boulder'}));

        renderAllMemories();

        await waitFor(() => expect(rowFor('Lives in Denver')).not.toBeNull());

        fireEvent.click(within(rowFor('Lives in Denver')).getByRole('button', {name: 'Edit'}));
        fireEvent.change(screen.getByLabelText('Memory content'), {target: {value: 'Lives in Boulder'}});
        fireEvent.click(screen.getByRole('button', {name: 'Save'}));

        await waitFor(() => expect(rowFor('Lives in Boulder')).not.toBeNull());
        expect(within(rowFor('Lives in Boulder')).getByTitle('user-9')).toBeDefined();
    });

    it('links only the admin\'s own conversations', async () => {
        memoryService.findAllMemories.mockResolvedValue(paged([
            memory({id: 'memory-1', userId: 'user-9', content: 'Theirs', chatIds: ['chat-theirs']}),
            memory({id: 'memory-2', userId: ADMIN_USER_ID, content: 'Mine', chatIds: ['chat-mine']}),
        ]));

        renderAllMemories();

        await waitFor(() => expect(rowContents()).toHaveLength(2));

        expect(rowFor('Theirs').querySelector('a')).toBeNull();
        expect(within(rowFor('Theirs')).getByTitle('chat-theirs')).toBeDefined();
        expect(rowFor('Mine').querySelector('a').getAttribute('href')).toBe('/chat/chat-mine');
    });

    it('edits on behalf of the row owner and keeps the admin columns', async () => {
        memoryService.findAllMemories.mockResolvedValue(paged([memory()]));
        memoryService.updateMemory.mockResolvedValue({
            id: 'memory-1',
            kind: 'FACT',
            origin: 'AUTHORED',
            status: 'ACTIVE',
            content: 'Lives in Boulder',
            confidence: 1,
            chatIds: [],
        });
        memoryService.deleteMemory.mockResolvedValue(null);

        renderAllMemories();

        await waitFor(() => expect(rowFor('Lives in Denver')).not.toBeNull());

        fireEvent.click(within(rowFor('Lives in Denver')).getByRole('button', {name: 'Edit'}));

        expect(screen.getByText(/on their behalf/)).toBeDefined();

        fireEvent.change(screen.getByLabelText('Memory content'), {target: {value: 'Lives in Boulder'}});
        fireEvent.click(screen.getByRole('button', {name: 'Save'}));

        await waitFor(() => expect(rowFor('Lives in Boulder')).not.toBeNull());
        expect(memoryService.updateMemory).toHaveBeenCalledWith('memory-1', {content: 'Lives in Boulder'}, 'user-9');
        expect(within(rowFor('Lives in Boulder')).getByTitle('user-9')).toBeDefined();
        expect(within(rowFor('Lives in Boulder')).getByText('Added by the user')).toBeDefined();

        fireEvent.click(within(rowFor('Lives in Boulder')).getByRole('button', {name: 'Delete'}));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Delete'}));

        await waitFor(() => expect(rowContents()).toEqual([]));
        expect(memoryService.deleteMemory).toHaveBeenCalledWith('memory-1', 'user-9');
    });
});

describe('AllMemories failures', () => {
    it('shows the no-access message on a 403', async () => {
        memoryService.findAllMemories.mockRejectedValue(forbidden());

        renderAllMemories();

        await waitFor(() => {
            expect(screen.getByText("You don't have access to memory administration.")).toBeDefined();
        });
        expect(screen.queryByLabelText('User ID')).toBeNull();
    });

    it('offers a retry after any other failure', async () => {
        memoryService.findAllMemories.mockRejectedValueOnce(new Error('network down'));
        memoryService.findAllMemories.mockResolvedValue(paged([memory()]));

        renderAllMemories();

        await waitFor(() => expect(screen.getByRole('button', {name: 'Retry'})).toBeDefined());

        fireEvent.click(screen.getByRole('button', {name: 'Retry'}));

        await waitFor(() => expect(rowContents()).toEqual(['Lives in Denver']));
    });
});
