import {render, screen, waitFor, fireEvent, within} from '@testing-library/react';
import {describe, it, vi, expect, beforeEach} from 'vitest';
import {MemoryRouter} from 'react-router';

vi.mock('../../../src/service/InterestService.js', async (importOriginal) => {
    const original = await importOriginal();

    return {
        ...original,
        default: {
            getAgents: vi.fn(),
            getPendingOffers: vi.fn(),
            updateAgent: vi.fn(),
            deleteAgent: vi.fn(),
            runAgent: vi.fn(),
            getAgentUpdates: vi.fn(),
        },
    };
});

vi.mock('react-toastify', () => ({
    toast: Object.assign(vi.fn(), {success: vi.fn(), error: vi.fn(), info: vi.fn()}),
}));

import InterestSettings from '../../../src/settings/interests/InterestSettings.jsx';
import interestService from '../../../src/service/InterestService.js';
import {ApiError} from '../../../src/client/ApiClient.js';
import {toast} from 'react-toastify';

const HOUR = 60 * 60 * 1000;

const agentWith = (overrides = {}) => ({
    id: 'agent-1',
    agentType: 'NEWS',
    label: 'Formula 1',
    query: 'formula 1 race results',
    cadence: 'DAILY',
    status: 'ACTIVE',
    chatGroupId: 'group-1',
    nextRunAt: new Date(Date.now() + 3 * HOUR + 60000).toISOString(),
    lastRunAt: null,
    lastUpdateAt: null,
    lastFailureAt: null,
    failures: 0,
    created: '2026-10-20T12:00:00Z',
    ...overrides,
});

const apiError = (status, code) => new ApiError({message: `${status}: ${code}`, status, method: 'PATCH', uri: '/x', code});

function renderSettings() {
    return render(
        <MemoryRouter>
            <InterestSettings/>
        </MemoryRouter>
    );
}

const cardFor = (label) => screen.getByText(label, {selector: '.interest-agent-label'}).closest('.interest-agent-card');

async function renderWithAgents(agents = [agentWith()]) {
    interestService.getAgents.mockResolvedValue(agents);
    renderSettings();

    await waitFor(() => expect(document.querySelectorAll('.interest-agent-card')).toHaveLength(agents.length));
}

beforeEach(() => {
    vi.clearAllMocks();
    interestService.getPendingOffers.mockResolvedValue([]);
    interestService.updateAgent.mockImplementation(async (agentId, changes) => agentWith({id: agentId, ...changes}));
    interestService.deleteAgent.mockResolvedValue(null);
    interestService.runAgent.mockImplementation(async (agentId) => agentWith({id: agentId, nextRunAt: new Date(Date.now() + 2 * 60000 + 30000).toISOString()}));
    interestService.getAgentUpdates.mockResolvedValue({content: [], totalElements: 0});
});

describe('InterestSettings list', () => {
    it('shows each agent with its query, cadence, status and schedule', async () => {
        await renderWithAgents();

        const card = cardFor('Formula 1');

        expect(within(card).getByText('formula 1 race results')).toBeDefined();
        expect(within(card).getByLabelText('Cadence').value).toBe('DAILY');
        expect(card.querySelector('.interest-agent-status').textContent).toBe('Active');
        expect(card.textContent).toContain('No news yet');
        expect(card.textContent).toContain('Next check in 3 hours');
        expect(card.textContent).not.toContain('Last check failed');
        expect(within(card).getByRole('button', {name: 'Check now'})).toBeDefined();
        expect(interestService.getPendingOffers).not.toHaveBeenCalled();
    });

    it('shows a paused agent with failures as Paused plus the failure, and no Check now', async () => {
        await renderWithAgents([agentWith({
            status: 'PAUSED',
            failures: 3,
            lastFailureAt: new Date(Date.now() - 2 * HOUR).toISOString(),
            lastUpdateAt: new Date(Date.now() - 26 * HOUR).toISOString(),
        })]);

        const card = cardFor('Formula 1');

        expect(card.querySelector('.interest-agent-status').textContent).toBe('Paused');
        expect(card.textContent).toContain('Last check failed 2 hours ago');
        expect(card.textContent).toContain('Last update 1 day ago');
        expect(card.textContent).not.toContain('Next check');
        expect(within(card).queryByRole('button', {name: 'Check now'})).toBeNull();
        expect(within(card).getByRole('button', {name: 'Resume'})).toBeDefined();
    });

    it('shows the empty state with a link to a pending offer', async () => {
        interestService.getPendingOffers.mockResolvedValue([{id: 'offer-1', label: 'Cycling'}]);
        interestService.getAgents.mockResolvedValue([]);

        renderSettings();

        await waitFor(() => expect(document.querySelector('.interest-settings-empty')).not.toBeNull());
        expect(document.querySelector('.interest-settings-empty').textContent)
            .toContain('No interests yet. When I notice something you follow, I\'ll offer to keep you posted.');
        await waitFor(() => expect(screen.getByRole('link', {name: /Cycling/}).getAttribute('href')).toBe('/interests/offers/offer-1'));
    });

    it('shows the empty state alone when the offer lookup fails', async () => {
        interestService.getPendingOffers.mockRejectedValue(new Error('network down'));
        interestService.getAgents.mockResolvedValue([]);

        renderSettings();

        await waitFor(() => expect(document.querySelector('.interest-settings-empty')).not.toBeNull());
        expect(document.querySelector('.interest-settings-empty a')).toBeNull();
    });

    it('offers a retry when the agents cannot be loaded', async () => {
        interestService.getAgents.mockRejectedValueOnce(new Error('network down')).mockResolvedValue([agentWith()]);

        renderSettings();

        await waitFor(() => expect(screen.getByRole('button', {name: 'Retry'})).toBeDefined());
        fireEvent.click(screen.getByRole('button', {name: 'Retry'}));

        await waitFor(() => expect(cardFor('Formula 1')).not.toBeNull());
    });
});

describe('InterestSettings agent changes', () => {
    it('pauses and resumes from the response', async () => {
        await renderWithAgents();

        fireEvent.click(within(cardFor('Formula 1')).getByRole('button', {name: 'Pause'}));

        await waitFor(() => expect(cardFor('Formula 1').querySelector('.interest-agent-status').textContent).toBe('Paused'));
        expect(interestService.updateAgent).toHaveBeenCalledWith('agent-1', {status: 'PAUSED'});

        fireEvent.click(within(cardFor('Formula 1')).getByRole('button', {name: 'Resume'}));

        await waitFor(() => expect(cardFor('Formula 1').querySelector('.interest-agent-status').textContent).toBe('Active'));
        expect(interestService.updateAgent).toHaveBeenLastCalledWith('agent-1', {status: 'ACTIVE'});
    });

    it('changes the cadence', async () => {
        await renderWithAgents();

        fireEvent.change(within(cardFor('Formula 1')).getByLabelText('Cadence'), {target: {value: 'WEEKLY'}});

        await waitFor(() => expect(interestService.updateAgent).toHaveBeenCalledWith('agent-1', {cadence: 'WEEKLY'}));
        await waitFor(() => expect(within(cardFor('Formula 1')).getByLabelText('Cadence').value).toBe('WEEKLY'));
    });

    it('reports a failed change and keeps the agent as it was', async () => {
        interestService.updateAgent.mockRejectedValue(apiError(500, undefined));
        await renderWithAgents();

        fireEvent.click(within(cardFor('Formula 1')).getByRole('button', {name: 'Pause'}));

        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(cardFor('Formula 1').querySelector('.interest-agent-status').textContent).toBe('Active');
    });

    it('re-reads the list when the agent is gone', async () => {
        interestService.updateAgent.mockRejectedValue(apiError(404, 'AGENT_NOT_FOUND'));
        await renderWithAgents();
        interestService.getAgents.mockResolvedValue([]);

        fireEvent.click(within(cardFor('Formula 1')).getByRole('button', {name: 'Pause'}));

        await waitFor(() => expect(document.querySelector('.interest-settings-empty')).not.toBeNull());
        expect(interestService.getAgents).toHaveBeenCalledTimes(2);
    });
});

describe('InterestSettings edit', () => {
    async function openEditor() {
        await renderWithAgents();
        fireEvent.click(within(cardFor('Formula 1')).getByRole('button', {name: 'Edit'}));

        return document.querySelector('.interest-agent-edit');
    }

    it('explains that past updates keep their name', async () => {
        const editor = await openEditor();

        expect(editor.textContent).toContain('Past updates and the chat group keep their current name.');
        expect(within(editor).getByLabelText('Label').value).toBe('Formula 1');
        expect(within(editor).getByLabelText('Search query').value).toBe('formula 1 race results');
    });

    it.each([
        ['Label', '   ', 'Give this interest a label.'],
        ['Label', 'x'.repeat(121), 'Keep the label to 120 characters or fewer.'],
        ['Search query', '', 'Give this interest a search query.'],
        ['Search query', 'x'.repeat(401), 'Keep the search query to 400 characters or fewer.'],
    ])('refuses a bad %s without asking the server', async (fieldLabel, value, message) => {
        const editor = await openEditor();

        fireEvent.change(within(editor).getByLabelText(fieldLabel), {target: {value}});
        fireEvent.click(within(editor).getByRole('button', {name: 'Save'}));

        expect(within(editor).getByText(message)).toBeDefined();
        expect(interestService.updateAgent).not.toHaveBeenCalled();
    });

    it('saves the trimmed label and query', async () => {
        const editor = await openEditor();

        fireEvent.change(within(editor).getByLabelText('Label'), {target: {value: '  F1  '}});
        fireEvent.change(within(editor).getByLabelText('Search query'), {target: {value: ' f1 news '}});
        fireEvent.click(within(editor).getByRole('button', {name: 'Save'}));

        await waitFor(() => expect(document.querySelector('.interest-agent-edit')).toBeNull());
        expect(interestService.updateAgent).toHaveBeenCalledWith('agent-1', {label: 'F1', query: 'f1 news'});
        expect(cardFor('F1')).not.toBeNull();
    });

    it('shows a refused edit inline and keeps the editor open', async () => {
        interestService.updateAgent.mockRejectedValue(apiError(400, 'INVALID_AGENT_UPDATE'));
        const editor = await openEditor();

        fireEvent.change(within(editor).getByLabelText('Search query'), {target: {value: 'f1'}});
        fireEvent.click(within(editor).getByRole('button', {name: 'Save'}));

        await waitFor(() => expect(within(editor).getByText('Those changes couldn\'t be saved. Check the label and search query.')).toBeDefined());
        expect(document.querySelector('.interest-agent-edit')).not.toBeNull();
    });

    it('closes an unchanged edit without asking the server', async () => {
        const editor = await openEditor();

        fireEvent.click(within(editor).getByRole('button', {name: 'Save'}));

        expect(document.querySelector('.interest-agent-edit')).toBeNull();
        expect(interestService.updateAgent).not.toHaveBeenCalled();
    });

    it('cancels without saving', async () => {
        const editor = await openEditor();

        fireEvent.click(within(editor).getByRole('button', {name: 'Cancel'}));

        expect(document.querySelector('.interest-agent-edit')).toBeNull();
        expect(interestService.updateAgent).not.toHaveBeenCalled();
    });
});

describe('InterestSettings check now', () => {
    it('asks for a run and updates the card from the response', async () => {
        await renderWithAgents();

        fireEvent.click(within(cardFor('Formula 1')).getByRole('button', {name: 'Check now'}));

        await waitFor(() => expect(cardFor('Formula 1').textContent).toContain('Next check in 2 minutes'));
        expect(interestService.runAgent).toHaveBeenCalledWith('agent-1');
        expect(interestService.getAgents).toHaveBeenCalledTimes(1);
        expect(toast.success).toHaveBeenCalledWith('I\'ll check for news within the next few minutes — you\'ll be notified if there\'s anything new.');
    });

    it('says it checked recently on a 429', async () => {
        interestService.runAgent.mockRejectedValue(apiError(429, 'RUN_TOO_SOON'));
        await renderWithAgents();

        fireEvent.click(within(cardFor('Formula 1')).getByRole('button', {name: 'Check now'}));

        await waitFor(() => expect(toast.info).toHaveBeenCalledWith('Checked recently, try again in a few minutes.'));
    });

    it('re-reads the list when the agent was paused meanwhile', async () => {
        interestService.runAgent.mockRejectedValue(apiError(400, 'INVALID_AGENT_UPDATE'));
        await renderWithAgents();
        interestService.getAgents.mockResolvedValue([agentWith({status: 'PAUSED'})]);

        fireEvent.click(within(cardFor('Formula 1')).getByRole('button', {name: 'Check now'}));

        await waitFor(() => expect(cardFor('Formula 1').querySelector('.interest-agent-status').textContent).toBe('Paused'));
        expect(interestService.getAgents).toHaveBeenCalledTimes(2);
    });
});

describe('InterestSettings recent updates', () => {
    it('lists the latest five updates as links to their chats', async () => {
        interestService.getAgentUpdates.mockResolvedValue({
            content: [{id: 'update-1', agentId: 'agent-1', label: 'Formula 1', chatId: 'chat-9', itemCount: 3, created: '2026-10-20T08:00:00Z'}],
            totalElements: 1,
        });
        await renderWithAgents();

        fireEvent.click(within(cardFor('Formula 1')).getByRole('button', {name: 'Recent updates'}));

        await waitFor(() => expect(cardFor('Formula 1').querySelector('.interest-agent-update a')).not.toBeNull());
        expect(interestService.getAgentUpdates).toHaveBeenCalledWith('agent-1', 0, 5);

        const updateLink = cardFor('Formula 1').querySelector('.interest-agent-update a');
        expect(updateLink.getAttribute('href')).toBe('/chat/chat-9');
        expect(updateLink.textContent).toContain('3 sources');
    });

    it('says when there are no updates yet', async () => {
        await renderWithAgents();

        fireEvent.click(within(cardFor('Formula 1')).getByRole('button', {name: 'Recent updates'}));

        await waitFor(() => expect(cardFor('Formula 1').textContent).toContain('No updates yet.'));
    });
});

describe('InterestSettings delete', () => {
    it('asks before stopping news and removes the card', async () => {
        await renderWithAgents([agentWith(), agentWith({id: 'agent-2', label: 'Cycling'})]);

        fireEvent.click(within(cardFor('Formula 1')).getByRole('button', {name: 'Delete'}));

        const dialog = screen.getByRole('dialog');
        expect(dialog.textContent).toContain('Stop news about Formula 1?');
        expect(dialog.textContent).toContain('Past updates stay in your chats.');

        fireEvent.click(within(dialog).getByRole('button', {name: 'Stop news'}));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(interestService.deleteAgent).toHaveBeenCalledWith('agent-1');
        expect(screen.queryByText('Formula 1', {selector: '.interest-agent-label'})).toBeNull();
        expect(cardFor('Cycling')).not.toBeNull();
    });

    it('cancels without deleting', async () => {
        await renderWithAgents();

        fireEvent.click(within(cardFor('Formula 1')).getByRole('button', {name: 'Delete'}));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Cancel'}));

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(interestService.deleteAgent).not.toHaveBeenCalled();
    });

    it('keeps the dialog open with an error when the delete fails', async () => {
        interestService.deleteAgent.mockRejectedValue(apiError(500, undefined));
        await renderWithAgents();

        fireEvent.click(within(cardFor('Formula 1')).getByRole('button', {name: 'Delete'}));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Stop news'}));

        await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('alert')).toBeDefined());
        expect(cardFor('Formula 1')).not.toBeNull();
    });
});
