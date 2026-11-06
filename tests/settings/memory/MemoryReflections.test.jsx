import {render, screen, waitFor, fireEvent, within} from '@testing-library/react';
import {MemoryRouter, Route, Routes} from 'react-router';
import {describe, it, vi, expect, beforeEach} from 'vitest';

import MemoryReflections from '../../../src/settings/memory/MemoryReflections.jsx';

vi.mock('../../../src/service/MemoryService.js', () => ({
    default: {
        findReflections: vi.fn(),
        getProcessingStatus: vi.fn(),
    },
}));

import memoryService from '../../../src/service/MemoryService.js';

vi.stubGlobal('IntersectionObserver', class {
    observe() {
    }

    disconnect() {
    }
});

const reflection = (overrides) => ({
    chatId: 'chat-aaaaaaaa-1111',
    userId: 'user-9',
    status: 'COMPLETED',
    attempts: 1,
    reflectedThrough: '2026-10-19T10:00:00Z',
    updated: '2026-10-19T10:05:00Z',
    ...overrides,
});

const paged = (content) => ({
    content,
    page: {size: 50, number: 0, totalElements: content.length, totalPages: 1},
});

const forbidden = () => {
    const caughtError = new Error('403: GET - /memories/reflections Forbidden');
    caughtError.status = 403;
    return caughtError;
};

function renderReflections(search = '') {
    return render(
        <MemoryRouter initialEntries={[`/settings/memory/reflections${search}`]}>
            <Routes>
                <Route path="/settings/memory/:level" element={<MemoryReflections/>}/>
            </Routes>
        </MemoryRouter>
    );
}

const reflectionRows = () => Array.from(document.querySelectorAll('.memory-reflection-row'));

const rowForChat = (chatId) => screen.getByTitle(chatId).closest('.memory-reflection-row');

const lastFilters = () => memoryService.findReflections.mock.calls.at(-1)[0];

describe('MemoryReflections', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        memoryService.getProcessingStatus.mockResolvedValue({reflection: {maxAttempts: 3}});
    });

    it('shows "Not started" for the epoch seed and highlights failures', async () => {
        memoryService.findReflections.mockResolvedValue(paged([
            reflection({chatId: 'chat-seeded', status: 'PENDING', attempts: 0, reflectedThrough: '1970-01-01T00:00:00Z'}),
            reflection({chatId: 'chat-failed', status: 'FAILED', attempts: 3}),
        ]));

        renderReflections();

        await waitFor(() => expect(reflectionRows()).toHaveLength(2));

        expect(within(rowForChat('chat-seeded')).getByText('Not started')).toBeDefined();
        expect(rowForChat('chat-seeded').className).not.toContain('memory-reflection-row-failed');
        expect(rowForChat('chat-failed').className).toContain('memory-reflection-row-failed');
    });

    it('shows attempts against the maximum once the status has loaded', async () => {
        memoryService.findReflections.mockResolvedValue(paged([reflection({attempts: 2})]));

        renderReflections();

        await waitFor(() => expect(screen.getByText('2 / 3')).toBeDefined());
    });

    it('shows bare attempts when the status is unavailable', async () => {
        memoryService.getProcessingStatus.mockRejectedValue(new Error('network down'));
        memoryService.findReflections.mockResolvedValue(paged([reflection({attempts: 2})]));

        renderReflections();

        await waitFor(() => expect(reflectionRows()).toHaveLength(1));

        const attemptsCell = reflectionRows()[0].querySelector('.memory-reflection-attempts');
        expect(attemptsCell.textContent).toBe('2');
    });

    it('sends the status and user filters from the URL', async () => {
        memoryService.findReflections.mockResolvedValue(paged([]));

        renderReflections('?userId=user-9&status=FAILED');

        await waitFor(() => expect(memoryService.findReflections).toHaveBeenCalled());

        expect(memoryService.findReflections).toHaveBeenCalledWith(
            {userId: 'user-9', statuses: ['FAILED'], sorts: []},
            0,
        );
        expect(screen.getByRole('checkbox', {name: 'Failed'}).checked).toBe(true);
        expect(screen.getByRole('checkbox', {name: 'Completed'}).checked).toBe(false);
    });

    it('sends a status filter chosen on the page', async () => {
        memoryService.findReflections.mockResolvedValue(paged([]));

        renderReflections();

        await waitFor(() => expect(memoryService.findReflections).toHaveBeenCalled());

        fireEvent.click(screen.getByRole('checkbox', {name: 'Completed'}));

        await waitFor(() => {
            expect(lastFilters().statuses).toEqual(['PENDING', 'IN_PROGRESS', 'FAILED']);
        });
    });

    it('sends the sort chosen in the select', async () => {
        memoryService.findReflections.mockResolvedValue(paged([]));

        renderReflections();

        await waitFor(() => expect(memoryService.findReflections).toHaveBeenCalled());

        fireEvent.change(screen.getByLabelText('Sort'), {target: {value: 'attempts'}});

        await waitFor(() => expect(lastFilters().sorts).toEqual(['attempts,desc']));
    });

    it('filters to a user when their id is clicked', async () => {
        memoryService.findReflections.mockResolvedValue(paged([reflection()]));

        renderReflections();

        await waitFor(() => expect(reflectionRows()).toHaveLength(1));

        fireEvent.click(within(reflectionRows()[0]).getByTitle('user-9'));

        await waitFor(() => expect(lastFilters().userId).toBe('user-9'));
    });

    it('names the user by username and still filters by id', async () => {
        memoryService.findReflections.mockResolvedValue(paged([reflection({username: 'sam'})]));

        renderReflections();

        await waitFor(() => expect(reflectionRows()).toHaveLength(1));

        const userButton = within(reflectionRows()[0]).getByTitle('user-9');
        expect(userButton.textContent).toBe('sam');

        fireEvent.click(userButton);

        await waitFor(() => expect(lastFilters().userId).toBe('user-9'));
    });

    it('shows the no-access message on a 403', async () => {
        memoryService.findReflections.mockRejectedValue(forbidden());

        renderReflections();

        await waitFor(() => {
            expect(screen.getByText("You don't have access to memory administration.")).toBeDefined();
        });
    });
});
