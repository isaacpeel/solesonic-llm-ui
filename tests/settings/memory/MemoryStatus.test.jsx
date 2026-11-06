import {render, screen, waitFor, fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router';
import {describe, it, vi, expect, beforeEach} from 'vitest';

import MemoryStatus from '../../../src/settings/memory/MemoryStatus.jsx';

vi.mock('../../../src/service/MemoryService.js', () => ({
    default: {
        getProcessingStatus: vi.fn(),
    },
}));

import memoryService from '../../../src/service/MemoryService.js';

const processingStatus = ({reflection = {}, embedding = {}, injection = {}, ...overrides} = {}) => ({
    asOf: '2026-10-19T12:00:00Z',
    reflection: {
        enabled: true,
        model: 'qwen3:14b',
        cron: '0 */5 * * * *',
        batchSize: 10,
        maxAttempts: 3,
        idleMinutes: 30,
        chatsByStatus: {PENDING: 4, IN_PROGRESS: 1, COMPLETED: 20, FAILED: 2},
        awaitingReflection: 3,
        unseededChats: 5,
        completedLastHour: 7,
        lastCompleted: '2026-10-19T11:50:00Z',
        ...reflection,
    },
    embedding: {model: 'nomic-embed-text', cron: '0 * * * * *', batchSize: 50, embedded: 120, stale: 0, ...embedding},
    injection: {enabled: true, retrievalMode: 'RELEVANT', ...injection},
    memoriesByStatus: {ACTIVE: 100, PENDING: 12, SUPERSEDED: 8},
    users: [{
        userId: 'user-9',
        activeMemories: 40,
        pendingMemories: 3,
        supersededMemories: 2,
        pendingChats: 1,
        inProgressChats: 0,
        completedChats: 10,
        failedChats: 2,
        lastReflected: '2026-10-19T11:00:00Z',
    }],
    ...overrides,
});

const forbidden = () => {
    const caughtError = new Error('403: GET - /memories/status Forbidden');
    caughtError.status = 403;
    return caughtError;
};

function renderStatus() {
    return render(
        <MemoryRouter>
            <MemoryStatus/>
        </MemoryRouter>
    );
}

const statValue = (cardTitle, label) => {
    const card = Array.from(document.querySelectorAll('.memory-status-card'))
        .find((candidate) => candidate.querySelector('.memory-status-card-title')?.textContent === cardTitle);
    const stat = Array.from(card.querySelectorAll('.memory-status-stat'))
        .find((candidate) => candidate.querySelector('.memory-status-stat-label')?.textContent === label);

    return stat.querySelector('.memory-status-stat-value').textContent;
};

const DISABLED_WARNING = 'Reflection is off. Nothing new will be learned.';

describe('MemoryStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the reflection, embedding and memory counts', async () => {
        memoryService.getProcessingStatus.mockResolvedValue(processingStatus());

        renderStatus();

        await waitFor(() => expect(document.querySelector('.memory-status-card')).not.toBeNull());

        expect(statValue('Reflection', 'Awaiting reflection')).toBe('3');
        expect(statValue('Reflection', 'Unseeded')).toBe('5');
        expect(statValue('Reflection', 'Failed')).toBe('2');
        expect(statValue('Reflection', 'Model')).toBe('qwen3:14b');
        expect(statValue('Embedding', 'Embedded')).toBe('120');
        expect(statValue('Memories', 'Superseded')).toBe('8');
        expect(statValue('Injection', 'Retrieval mode')).toContain('RELEVANT');
    });

    it('notes the hourly ceiling a simple cron allows', async () => {
        memoryService.getProcessingStatus.mockResolvedValue(processingStatus());

        renderStatus();

        await waitFor(() => expect(document.querySelector('.memory-status-card')).not.toBeNull());

        expect(statValue('Reflection', 'Completed last hour')).toBe('7 of at most 120');
    });

    it('warns only when reflection is disabled', async () => {
        memoryService.getProcessingStatus.mockResolvedValue(processingStatus({reflection: {enabled: false}}));

        const {unmount} = renderStatus();

        await waitFor(() => expect(screen.getByText(DISABLED_WARNING)).toBeDefined());

        unmount();
        memoryService.getProcessingStatus.mockResolvedValue(processingStatus());

        renderStatus();

        await waitFor(() => expect(document.querySelector('.memory-status-card')).not.toBeNull());
        expect(screen.queryByText(DISABLED_WARNING)).toBeNull();
    });

    it('warns only when memories are waiting to be embedded', async () => {
        memoryService.getProcessingStatus.mockResolvedValue(processingStatus({embedding: {stale: 5}}));

        const {unmount} = renderStatus();

        await waitFor(() => {
            expect(screen.getByText("5 memories can't be found by relevance search until they're embedded.")).toBeDefined();
        });

        unmount();
        memoryService.getProcessingStatus.mockResolvedValue(processingStatus());

        renderStatus();

        await waitFor(() => expect(document.querySelector('.memory-status-card')).not.toBeNull());
        expect(screen.queryByText(/can't be found by relevance search/)).toBeNull();
    });

    it('links each user to their memories and failed reflections', async () => {
        memoryService.getProcessingStatus.mockResolvedValue(processingStatus({
            users: [
                processingStatus().users[0],
                {...processingStatus().users[0], userId: 'user-3', failedChats: 0},
            ],
        }));

        renderStatus();

        await waitFor(() => expect(document.querySelectorAll('.memory-status-user-row')).toHaveLength(2));

        const [firstRow, secondRow] = document.querySelectorAll('.memory-status-user-row');
        const firstHrefs = Array.from(firstRow.querySelectorAll('a')).map((anchor) => anchor.getAttribute('href'));
        const secondHrefs = Array.from(secondRow.querySelectorAll('a')).map((anchor) => anchor.getAttribute('href'));

        expect(firstHrefs).toEqual([
            '/settings/memory/all?userId=user-9',
            '/settings/memory/reflections?userId=user-9&status=FAILED',
        ]);
        expect(secondHrefs).toEqual(['/settings/memory/all?userId=user-3']);
    });

    it('names each user by username, falling back to a short id', async () => {
        memoryService.getProcessingStatus.mockResolvedValue(processingStatus({
            users: [
                {...processingStatus().users[0], username: 'sam'},
                {...processingStatus().users[0], userId: 'user-3abcdefgh'},
            ],
        }));

        renderStatus();

        await waitFor(() => expect(document.querySelectorAll('.memory-status-user-row')).toHaveLength(2));

        const [named, unnamed] = document.querySelectorAll('.memory-status-user-row');
        expect(named.querySelector('a').textContent).toBe('sam');
        expect(named.querySelector('a').getAttribute('title')).toBe('user-9');
        expect(unnamed.querySelector('a').textContent).toBe('user-3ab');
    });

    it('reloads on Refresh', async () => {
        memoryService.getProcessingStatus.mockResolvedValue(processingStatus());

        renderStatus();

        await waitFor(() => expect(memoryService.getProcessingStatus).toHaveBeenCalledTimes(1));

        memoryService.getProcessingStatus.mockResolvedValue(processingStatus({reflection: {awaitingReflection: 0}}));
        fireEvent.click(screen.getByRole('button', {name: 'Refresh'}));

        await waitFor(() => expect(statValue('Reflection', 'Awaiting reflection')).toBe('0'));
        expect(memoryService.getProcessingStatus).toHaveBeenCalledTimes(2);
    });

    it('shows the no-access message on a 403', async () => {
        memoryService.getProcessingStatus.mockRejectedValue(forbidden());

        renderStatus();

        await waitFor(() => {
            expect(screen.getByText("You don't have access to memory administration.")).toBeDefined();
        });
        expect(screen.queryByRole('button', {name: 'Refresh'})).toBeNull();
    });
});
