import {render, screen, waitFor, fireEvent, within, act} from '@testing-library/react';
import {MemoryRouter} from 'react-router';
import {describe, it, vi, expect, beforeEach} from 'vitest';

import MyMemories from '../../../src/settings/memory/MyMemories.jsx';

vi.mock('../../../src/service/MemoryService.js', () => ({
    default: {
        findMemories: vi.fn(),
        createMemory: vi.fn(),
        updateMemory: vi.fn(),
        deleteMemory: vi.fn(),
        deleteAllMemories: vi.fn(),
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

const PENDING_HINT = "Learned once. It's used after it comes up in a second conversation.";
const OWNERSHIP_NOTE = 'Editing makes this memory yours. Deleting the conversations it came from will no longer remove it.';

const memory = (overrides) => ({
    id: 'memory-1',
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

const apiError = (status) => {
    const caughtError = new Error(`${status}: PATCH - /users/user-7/memories/memory-1`);
    caughtError.status = status;
    return caughtError;
};

function renderMyMemories(search = '') {
    return render(
        <MemoryRouter initialEntries={[`/settings/memory/mine${search}`]}>
            <MyMemories/>
        </MemoryRouter>
    );
}

const sectionHeadings = () => Array.from(document.querySelectorAll('.my-memories-section-heading'))
    .map((heading) => heading.textContent.trim());

const rowContents = (container = document) => Array.from(container.querySelectorAll('.memory-row-content'))
    .map((content) => content.textContent.trim());

const rowFor = (content) => screen.getByText(content).closest('.memory-row');

const lastFilters = () => memoryService.findMemories.mock.calls.at(-1)[0];

beforeEach(() => {
    liveObservers = new Set();
});

describe('MyMemories listing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders sections in instruction, preference, fact order keeping the server order within each', async () => {
        memoryService.findMemories.mockResolvedValue(paged([
            memory({id: 'memory-1', kind: 'FACT', content: 'Lives in Denver'}),
            memory({id: 'memory-3', kind: 'PREFERENCE', content: 'Prefers tea'}),
            memory({id: 'memory-2', kind: 'PREFERENCE', status: 'PENDING', content: 'Likes jazz'}),
            memory({id: 'memory-4', kind: 'INSTRUCTION', origin: 'AUTHORED', confidence: 1, content: 'Answer briefly'}),
        ]));

        renderMyMemories();

        await waitFor(() => expect(sectionHeadings()).toEqual(['Standing instructions', 'Preferences', 'Facts']));

        const preferencesSection = screen.getByText('Preferences').closest('.my-memories-section');
        expect(rowContents(preferencesSection)).toEqual(['Prefers tea', 'Likes jazz']);
    });

    it('requests active and pending memories, active first, from the first page', async () => {
        memoryService.findMemories.mockResolvedValue(paged([]));

        renderMyMemories();

        await waitFor(() => expect(memoryService.findMemories).toHaveBeenCalled());

        expect(memoryService.findMemories).toHaveBeenCalledWith(
            {statuses: ['ACTIVE', 'PENDING'], sorts: ['status,asc', 'lastConfirmed,desc']},
            0,
        );
    });

    it('hides a section with no memories', async () => {
        memoryService.findMemories.mockResolvedValue(paged([memory({kind: 'FACT'})]));

        renderMyMemories();

        await waitFor(() => expect(sectionHeadings()).toEqual(['Facts']));
    });

    it('shows the pending badge and hint on a pending memory only', async () => {
        memoryService.findMemories.mockResolvedValue(paged([
            memory({id: 'memory-1', status: 'PENDING', content: 'Likes jazz'}),
            memory({id: 'memory-2', content: 'Lives in Denver'}),
        ]));

        renderMyMemories();

        await waitFor(() => expect(rowFor('Likes jazz')).not.toBeNull());

        expect(rowFor('Likes jazz').querySelector('.memory-badge-pending')).not.toBeNull();
        expect(within(rowFor('Likes jazz')).getByText(PENDING_HINT)).toBeDefined();
        expect(rowFor('Lives in Denver').querySelector('.memory-badge-pending')).toBeNull();
    });

    it('labels each origin', async () => {
        memoryService.findMemories.mockResolvedValue(paged([
            memory({id: 'memory-1', origin: 'INFERRED', content: 'Inferred one'}),
            memory({id: 'memory-2', origin: 'REMEMBERED', confidence: 1, content: 'Remembered one'}),
            memory({id: 'memory-3', origin: 'AUTHORED', confidence: 1, content: 'Authored one'}),
        ]));

        renderMyMemories();

        await waitFor(() => expect(rowFor('Inferred one')).not.toBeNull());

        expect(within(rowFor('Inferred one')).getByText('Learned')).toBeDefined();
        expect(within(rowFor('Remembered one')).getByText('Remembered')).toBeDefined();
        expect(within(rowFor('Authored one')).getByText('Added by you')).toBeDefined();
    });

    it('shows confidence only for an inferred memory', async () => {
        memoryService.findMemories.mockResolvedValue(paged([
            memory({id: 'memory-1', origin: 'INFERRED', confidence: 0.85, content: 'Inferred one'}),
            memory({id: 'memory-2', origin: 'AUTHORED', confidence: 1, content: 'Authored one'}),
        ]));

        renderMyMemories();

        await waitFor(() => expect(rowFor('Inferred one')).not.toBeNull());

        expect(rowFor('Inferred one').querySelector('.memory-row-confidence').textContent).toContain('85%');
        expect(rowFor('Authored one').querySelector('.memory-row-confidence')).toBeNull();
    });

    it('links each source conversation to its chat', async () => {
        memoryService.findMemories.mockResolvedValue(paged([
            memory({chatIds: ['chat-1', 'chat-2']}),
        ]));

        renderMyMemories();

        await waitFor(() => expect(screen.getByText(/Learned from 2 conversations/)).toBeDefined());

        const hrefs = Array.from(rowFor('Lives in Denver').querySelectorAll('a'))
            .map((anchor) => anchor.getAttribute('href'));
        expect(hrefs).toEqual(['/chat/chat-1', '/chat/chat-2']);
    });

    it('shows the empty state when nothing has been learned', async () => {
        memoryService.findMemories.mockResolvedValue(paged([]));

        renderMyMemories();

        await waitFor(() => {
            expect(screen.getByText(/Nothing learned yet\. Memories appear here after a conversation has been quiet for a while\./)).toBeDefined();
        });
        expect(screen.queryByText('Forget everything')).toBeNull();
    });

    it('offers a retry after a failed load', async () => {
        memoryService.findMemories.mockRejectedValueOnce(new Error('network down'));
        memoryService.findMemories.mockResolvedValue(paged([memory()]));

        renderMyMemories();

        await waitFor(() => expect(screen.getByText('Retry')).toBeDefined());
        expect(screen.queryByText(/network down/)).toBeNull();

        fireEvent.click(screen.getByText('Retry'));

        await waitFor(() => expect(rowContents()).toEqual(['Lives in Denver']));
    });
});

describe('MyMemories paging and sorting', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('loads the next page when the end of the list is reached', async () => {
        memoryService.findMemories.mockImplementation(async (filters, page) => paged(
            [memory({id: `memory-${page}`, content: `Memory page ${page}`})],
            {number: page, totalPages: 2},
        ));

        renderMyMemories();

        await waitFor(() => expect(rowContents()).toEqual(['Memory page 0']));

        await scrollToSentinel();

        await waitFor(() => expect(rowContents()).toEqual(['Memory page 0', 'Memory page 1']));
        expect(memoryService.findMemories.mock.calls.at(-1)[1]).toBe(1);
        expect(document.querySelector('.memory-sentinel')).toBeNull();
    });

    it('sends the sort chosen in the select and starts paging over', async () => {
        memoryService.findMemories.mockImplementation(async (filters, page) => {
            if (filters.sorts[0] === 'confidence,desc') {
                return paged([memory({id: 'memory-9', content: 'Most confident'})]);
            }

            return paged(
                [memory({id: `memory-${page}`, content: `Memory page ${page}`})],
                {number: page, totalPages: 2},
            );
        });

        renderMyMemories();

        await waitFor(() => expect(rowContents()).toEqual(['Memory page 0']));

        await scrollToSentinel();

        await waitFor(() => expect(rowContents()).toEqual(['Memory page 0', 'Memory page 1']));

        fireEvent.change(screen.getByLabelText('Sort memories'), {target: {value: 'confidence'}});

        await waitFor(() => expect(rowContents()).toEqual(['Most confident']));
        expect(lastFilters().sorts).toEqual(['confidence,desc']);
        expect(memoryService.findMemories.mock.calls.at(-1)[1]).toBe(0);
    });

    it('reads its sort from the URL', async () => {
        memoryService.findMemories.mockResolvedValue(paged([memory()]));

        renderMyMemories('?sort=oldest');

        await waitFor(() => expect(memoryService.findMemories).toHaveBeenCalled());

        expect(lastFilters().sorts).toEqual(['created,asc']);
        await waitFor(() => expect(screen.getByLabelText('Sort memories').value).toBe('oldest'));
    });
});

describe('MyMemories filtering', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        memoryService.findMemories.mockResolvedValue(paged([
            memory({id: 'memory-1', origin: 'INFERRED', content: 'Lives in Denver'}),
            memory({id: 'memory-2', origin: 'AUTHORED', confidence: 1, content: 'Works on weekends'}),
        ]));
    });

    it('filters by a substring of the content', async () => {
        renderMyMemories();

        await waitFor(() => expect(rowContents()).toHaveLength(2));

        fireEvent.change(screen.getByLabelText('Filter memories'), {target: {value: 'denver'}});

        expect(rowContents()).toEqual(['Lives in Denver']);
    });

    it('filters by origin chip', async () => {
        renderMyMemories();

        await waitFor(() => expect(rowContents()).toHaveLength(2));

        fireEvent.click(screen.getByRole('button', {name: 'Added by you'}));

        expect(rowContents()).toEqual(['Works on weekends']);
    });
});

describe('MyMemories editing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sends only the changed fields and replaces the row with the response', async () => {
        memoryService.findMemories.mockResolvedValue(paged([memory()]));
        memoryService.updateMemory.mockResolvedValue(memory({
            content: 'Lives in Boulder',
            origin: 'AUTHORED',
            confidence: 1,
            chatIds: [],
        }));

        renderMyMemories();

        await waitFor(() => expect(rowFor('Lives in Denver')).not.toBeNull());

        fireEvent.click(within(rowFor('Lives in Denver')).getByRole('button', {name: 'Edit'}));
        fireEvent.change(screen.getByLabelText('Memory content'), {target: {value: 'Lives in Boulder'}});
        fireEvent.click(screen.getByRole('button', {name: 'Save'}));

        await waitFor(() => expect(rowFor('Lives in Boulder')).not.toBeNull());

        expect(memoryService.updateMemory).toHaveBeenCalledWith('memory-1', {content: 'Lives in Boulder'}, undefined);
        expect(within(rowFor('Lives in Boulder')).getByText('Added by you')).toBeDefined();
        expect(screen.queryByText('Lives in Denver')).toBeNull();
    });

    it('moves an edited memory to the section of its new kind', async () => {
        memoryService.findMemories.mockResolvedValue(paged([memory()]));
        memoryService.updateMemory.mockResolvedValue(memory({kind: 'PREFERENCE', origin: 'AUTHORED', confidence: 1}));

        renderMyMemories();

        await waitFor(() => expect(sectionHeadings()).toEqual(['Facts']));

        fireEvent.click(within(rowFor('Lives in Denver')).getByRole('button', {name: 'Edit'}));
        fireEvent.change(screen.getByLabelText('Memory kind'), {target: {value: 'PREFERENCE'}});
        fireEvent.click(screen.getByRole('button', {name: 'Save'}));

        await waitFor(() => expect(sectionHeadings()).toEqual(['Preferences']));
        expect(memoryService.updateMemory).toHaveBeenCalledWith('memory-1', {kind: 'PREFERENCE'}, undefined);
    });

    it('notes the ownership change when editing a learned memory', async () => {
        memoryService.findMemories.mockResolvedValue(paged([memory({origin: 'REMEMBERED', confidence: 1})]));

        renderMyMemories();

        await waitFor(() => expect(rowFor('Lives in Denver')).not.toBeNull());

        fireEvent.click(within(rowFor('Lives in Denver')).getByRole('button', {name: 'Edit'}));

        expect(screen.getByText(OWNERSHIP_NOTE)).toBeDefined();
    });

    it('does not note an ownership change on a memory already yours', async () => {
        memoryService.findMemories.mockResolvedValue(paged([memory({origin: 'AUTHORED', confidence: 1})]));

        renderMyMemories();

        await waitFor(() => expect(rowFor('Lives in Denver')).not.toBeNull());

        fireEvent.click(within(rowFor('Lives in Denver')).getByRole('button', {name: 'Edit'}));

        expect(screen.queryByText(OWNERSHIP_NOTE)).toBeNull();
    });

    it('explains a rejected save without showing the raw error', async () => {
        memoryService.findMemories.mockResolvedValue(paged([memory()]));
        memoryService.updateMemory.mockRejectedValue(apiError(400));

        renderMyMemories();

        await waitFor(() => expect(rowFor('Lives in Denver')).not.toBeNull());

        fireEvent.click(within(rowFor('Lives in Denver')).getByRole('button', {name: 'Edit'}));
        fireEvent.change(screen.getByLabelText('Memory content'), {target: {value: 'x'.repeat(5000)}});
        fireEvent.click(screen.getByRole('button', {name: 'Save'}));

        await waitFor(() => {
            expect(screen.getByText("The memory couldn't be saved. Check that it isn't empty or too long.")).toBeDefined();
        });
        expect(screen.queryByText(/PATCH/)).toBeNull();
    });

    it('removes the row when the memory is gone by the time it is saved', async () => {
        memoryService.findMemories.mockResolvedValueOnce(paged([memory()]));
        memoryService.findMemories.mockResolvedValue(paged([]));
        memoryService.updateMemory.mockRejectedValue(apiError(404));

        renderMyMemories();

        await waitFor(() => expect(rowFor('Lives in Denver')).not.toBeNull());

        fireEvent.click(within(rowFor('Lives in Denver')).getByRole('button', {name: 'Edit'}));
        fireEvent.change(screen.getByLabelText('Memory content'), {target: {value: 'Lives in Boulder'}});
        fireEvent.click(screen.getByRole('button', {name: 'Save'}));

        await waitFor(() => expect(rowContents()).toEqual([]));
        await waitFor(() => expect(memoryService.findMemories).toHaveBeenCalledTimes(2));
    });
});

describe('MyMemories deleting', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        memoryService.findMemories.mockResolvedValue(paged([
            memory({id: 'memory-1', content: 'Lives in Denver'}),
            memory({id: 'memory-2', content: 'Works on weekends'}),
        ]));
    });

    it('removes the row after a confirmed delete', async () => {
        memoryService.deleteMemory.mockResolvedValue(null);

        renderMyMemories();

        await waitFor(() => expect(rowFor('Lives in Denver')).not.toBeNull());

        fireEvent.click(within(rowFor('Lives in Denver')).getByRole('button', {name: 'Delete'}));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Delete'}));

        await waitFor(() => expect(rowContents()).toEqual(['Works on weekends']));
        expect(memoryService.deleteMemory).toHaveBeenCalledWith('memory-1', undefined);
    });

    it('treats a delete 404 as success', async () => {
        memoryService.deleteMemory.mockRejectedValue(apiError(404));

        renderMyMemories();

        await waitFor(() => expect(rowFor('Lives in Denver')).not.toBeNull());

        fireEvent.click(within(rowFor('Lives in Denver')).getByRole('button', {name: 'Delete'}));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Delete'}));

        await waitFor(() => expect(rowContents()).toEqual(['Works on weekends']));
    });

    it('keeps the row and reports any other delete failure', async () => {
        memoryService.deleteMemory.mockRejectedValue(apiError(500));

        renderMyMemories();

        await waitFor(() => expect(rowFor('Lives in Denver')).not.toBeNull());

        fireEvent.click(within(rowFor('Lives in Denver')).getByRole('button', {name: 'Delete'}));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Delete'}));

        await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('alert')).toBeDefined());
        expect(rowContents()).toEqual(['Lives in Denver', 'Works on weekends']);
    });
});

describe('MyMemories adding', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        memoryService.findMemories.mockResolvedValue(paged([]));
    });

    it('requires both a kind and content before submitting', async () => {
        renderMyMemories();

        const addForm = await screen.findByRole('form', {name: 'Add a memory'});
        const submitButton = within(addForm).getByRole('button', {name: 'Add memory'});

        expect(submitButton.disabled).toBe(true);

        fireEvent.change(within(addForm).getByLabelText('Memory'), {target: {value: 'Likes dark mode'}});
        expect(submitButton.disabled).toBe(true);

        fireEvent.change(within(addForm).getByLabelText('Kind'), {target: {value: 'PREFERENCE'}});
        expect(submitButton.disabled).toBe(false);
    });

    it('inserts the created memory', async () => {
        memoryService.createMemory.mockResolvedValue(memory({
            id: 'memory-9',
            kind: 'PREFERENCE',
            origin: 'AUTHORED',
            confidence: 1,
            content: 'Likes dark mode',
            chatIds: [],
        }));

        renderMyMemories();

        const addForm = await screen.findByRole('form', {name: 'Add a memory'});

        await waitFor(() => expect(screen.getByText(/Nothing learned yet/)).toBeDefined());

        fireEvent.change(within(addForm).getByLabelText('Kind'), {target: {value: 'PREFERENCE'}});
        fireEvent.change(within(addForm).getByLabelText('Memory'), {target: {value: '  Likes dark mode  '}});
        fireEvent.click(within(addForm).getByRole('button', {name: 'Add memory'}));

        await waitFor(() => expect(rowContents()).toEqual(['Likes dark mode']));
        expect(memoryService.createMemory).toHaveBeenCalledWith({kind: 'PREFERENCE', content: 'Likes dark mode'});
        expect(sectionHeadings()).toEqual(['Preferences']);
        expect(within(addForm).getByLabelText('Memory').value).toBe('');
    });
});

describe('MyMemories forget everything', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        memoryService.findMemories.mockResolvedValueOnce(paged([memory()]));
        memoryService.findMemories.mockResolvedValue(paged([]));
        memoryService.deleteAllMemories.mockResolvedValue(null);
    });

    it('needs the typed word before it deletes everything', async () => {
        renderMyMemories();

        await waitFor(() => expect(rowFor('Lives in Denver')).not.toBeNull());

        fireEvent.click(screen.getByRole('button', {name: 'Forget everything'}));

        const dialog = screen.getByRole('dialog');
        const confirmButton = within(dialog).getByRole('button', {name: 'Forget everything'});

        expect(confirmButton.disabled).toBe(true);

        fireEvent.change(within(dialog).getByLabelText(/Type forget to confirm/), {target: {value: 'forg'}});
        expect(confirmButton.disabled).toBe(true);

        fireEvent.change(within(dialog).getByLabelText(/Type forget to confirm/), {target: {value: 'forget'}});
        expect(confirmButton.disabled).toBe(false);

        fireEvent.click(confirmButton);

        await waitFor(() => expect(screen.getByText(/Nothing learned yet/)).toBeDefined());
        expect(memoryService.deleteAllMemories).toHaveBeenCalledWith();
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
