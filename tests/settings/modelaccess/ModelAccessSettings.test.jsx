import {render, screen, waitFor, fireEvent, within} from '@testing-library/react';
import {MemoryRouter, Route, Routes} from 'react-router';
import {describe, it, vi, expect, beforeEach} from 'vitest';

import ModelAccessSettings from '../../../src/settings/modelaccess/ModelAccessSettings.jsx';
import {useKeycloak} from '../../../src/providers/KeycloakProvider.jsx';
import {ApiError} from '../../../src/client/ApiClient.js';

vi.mock('../../../src/providers/KeycloakProvider.jsx', () => ({
    useKeycloak: vi.fn(),
}));

vi.mock('../../../src/service/LlmKeyService.js', async (importOriginal) => ({
    ...(await importOriginal()),
    default: {
        findKeys: vi.fn(),
        registerKey: vi.fn(),
        removeKey: vi.fn(),
    },
}));

vi.mock('react-toastify', () => ({
    toast: Object.assign(vi.fn(), {error: vi.fn(), info: vi.fn()}),
}));

import llmKeyService from '../../../src/service/LlmKeyService.js';
import {toast} from 'react-toastify';

const ADMIN_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FIRST_USER_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_USER_ID = '22222222-2222-4222-8222-222222222222';
const NEW_USER_ID = '33333333-3333-4333-8333-333333333333';
const VALID_KEY = 'sk-secret-key-value-9876';

const summary = (overrides) => ({
    userId: FIRST_USER_ID,
    username: 'sam',
    keyHint: '1234',
    created: '2026-10-01T12:00:00Z',
    updated: '2026-10-20T12:00:00Z',
    updatedBy: 'someone-else',
    ...overrides,
});

const paged = (content) => ({
    content,
    page: {size: 50, number: 0, totalElements: content.length, totalPages: content.length > 0 ? 1 : 0},
});

const apiError = (status, code, serverMessage) => new ApiError({
    message: `${status}: PUT - /llm-keys ${serverMessage ?? ''}`,
    status,
    method: 'PUT',
    uri: '/llm-keys',
    code,
    serverMessage,
});

function renderModelAccess() {
    return render(
        <MemoryRouter initialEntries={['/settings/model-access']}>
            <Routes>
                <Route path="/settings/model-access" element={<ModelAccessSettings/>}/>
                <Route path="/settings/general" element={<div data-testid="general-settings"/>}/>
            </Routes>
        </MemoryRouter>
    );
}

const rows = () => Array.from(document.querySelectorAll('.llm-key-row'));

const rowNames = () => rows().map((row) => row.querySelector('.llm-key-row-name').textContent.trim());

const rowFor = (name) => rows().find((row) => row.querySelector('.llm-key-row-name').textContent.trim() === name);

const keyInput = () => screen.getByLabelText('API key');

const saveButton = () => screen.getByRole('button', {name: 'Save'});

async function openGrantForm() {
    await waitFor(() => expect(screen.getByRole('button', {name: 'Give access'}).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', {name: 'Give access'}));
}

function fillGrantForm(userId, apiKey) {
    fireEvent.change(screen.getByLabelText('User ID'), {target: {value: userId}});
    fireEvent.change(keyInput(), {target: {value: apiKey}});
}

beforeEach(() => {
    vi.clearAllMocks();
    useKeycloak.mockReturnValue({
        keycloak: {tokenParsed: {sub: ADMIN_USER_ID}},
        hasRole: (role) => role === 'llm-key-admin',
    });
});

describe('ModelAccessSettings list', () => {
    it('lists each key by username and last four characters', async () => {
        llmKeyService.findKeys.mockResolvedValue(paged([
            summary(),
            summary({userId: SECOND_USER_ID, username: null, keyHint: '5678'}),
        ]));

        renderModelAccess();

        await waitFor(() => expect(rows()).toHaveLength(2));

        expect(rowNames()).toEqual(['sam', SECOND_USER_ID]);
        expect(rowFor('sam').querySelector('.llm-key-row-hint').textContent).toBe('•••• 1234');
        expect(rowFor(SECOND_USER_ID).querySelector('.llm-key-row-name-id')).not.toBeNull();
        expect(within(rowFor(SECOND_USER_ID)).getByRole('button', {name: 'Copy user id'})).toBeDefined();
        expect(llmKeyService.findKeys).toHaveBeenCalledWith(0);
    });

    it('says "you" when the caller made the last change', async () => {
        llmKeyService.findKeys.mockResolvedValue(paged([
            summary({updatedBy: ADMIN_USER_ID}),
            summary({userId: SECOND_USER_ID, username: 'kim', updatedBy: 'other-admin'}),
        ]));

        renderModelAccess();

        await waitFor(() => expect(rows()).toHaveLength(2));

        expect(rowFor('sam').querySelector('.llm-key-row-updated').textContent).toMatch(/by you$/);
        expect(rowFor('kim').querySelector('.llm-key-row-updated').textContent).toMatch(/by other-admin$/);
    });

    it('shows an empty state when no one has a key', async () => {
        llmKeyService.findKeys.mockResolvedValue(paged([]));

        renderModelAccess();

        await waitFor(() => expect(screen.getByText('No one has model access yet.')).toBeDefined());
    });

    it('shows a permission message when the list is refused', async () => {
        llmKeyService.findKeys.mockRejectedValue(apiError(403));

        renderModelAccess();

        await waitFor(() => {
            expect(screen.getByText('You no longer have permission to manage model access.')).toBeDefined();
        });
        expect(screen.queryByRole('button', {name: 'Give access'})).toBeNull();
    });

    it('redirects a user without the role to general settings', async () => {
        useKeycloak.mockReturnValue({keycloak: {tokenParsed: {sub: 'user-1'}}, hasRole: () => false});

        renderModelAccess();

        await waitFor(() => expect(screen.getByTestId('general-settings')).toBeDefined());
        expect(llmKeyService.findKeys).not.toHaveBeenCalled();
    });
});

describe('ModelAccessSettings granting', () => {
    beforeEach(() => {
        llmKeyService.findKeys.mockResolvedValue(paged([summary()]));
    });

    it('keeps Save disabled until the key and user id are well formed', async () => {
        renderModelAccess();
        await openGrantForm();

        expect(keyInput().getAttribute('type')).toBe('password');
        expect(keyInput().getAttribute('autocomplete')).toBe('new-password');
        expect(keyInput().getAttribute('data-1p-ignore')).toBe('true');
        expect(saveButton().disabled).toBe(true);

        fillGrantForm(NEW_USER_ID, 'short');
        expect(saveButton().disabled).toBe(true);

        fillGrantForm(NEW_USER_ID, 'sk-has whitespace');
        expect(saveButton().disabled).toBe(true);

        fillGrantForm('not-a-uuid', VALID_KEY);
        expect(saveButton().disabled).toBe(true);

        fillGrantForm(NEW_USER_ID, VALID_KEY);
        expect(saveButton().disabled).toBe(false);
    });

    it('accepts a pasted key with a trailing newline', async () => {
        renderModelAccess();
        await openGrantForm();

        fillGrantForm(NEW_USER_ID, `${VALID_KEY}\n`);

        expect(keyInput().value).toBe(VALID_KEY);
        expect(saveButton().disabled).toBe(false);
    });

    it('locks the row actions while a form is open', async () => {
        renderModelAccess();
        await waitFor(() => expect(rows()).toHaveLength(1));

        fireEvent.click(screen.getByRole('button', {name: 'Give access'}));

        expect(within(rowFor('sam')).getByRole('button', {name: 'Replace key'}).disabled).toBe(true);
        expect(within(rowFor('sam')).getByRole('button', {name: 'Remove access'}).disabled).toBe(true);
        expect(screen.getByRole('button', {name: 'Give access'}).disabled).toBe(true);
    });

    it('toggles the key between hidden and shown', async () => {
        renderModelAccess();
        await openGrantForm();

        fireEvent.click(screen.getByRole('button', {name: 'Show key'}));
        expect(keyInput().getAttribute('type')).toBe('text');

        fireEvent.click(screen.getByRole('button', {name: 'Hide key'}));
        expect(keyInput().getAttribute('type')).toBe('password');
    });

    it('prepends the new row, closes the form and forgets the key', async () => {
        llmKeyService.registerKey.mockResolvedValue(summary({userId: NEW_USER_ID, username: 'newbie', keyHint: '9876'}));

        const {container} = renderModelAccess();
        await openGrantForm();

        fillGrantForm(NEW_USER_ID, VALID_KEY);
        fireEvent.click(saveButton());

        await waitFor(() => expect(rowNames()).toEqual(['newbie', 'sam']));
        expect(llmKeyService.registerKey).toHaveBeenCalledWith(NEW_USER_ID, VALID_KEY);
        expect(screen.queryByLabelText('API key')).toBeNull();
        expect(container.innerHTML).not.toContain(VALID_KEY);
    });

    it('replaces rather than duplicates when granting to a user who already has a key', async () => {
        llmKeyService.findKeys.mockResolvedValue(paged([
            summary({userId: SECOND_USER_ID, username: 'kim'}),
            summary(),
        ]));
        llmKeyService.registerKey.mockResolvedValue(summary({keyHint: '4321'}));

        renderModelAccess();
        await openGrantForm();

        fillGrantForm(FIRST_USER_ID, VALID_KEY);
        fireEvent.click(saveButton());

        await waitFor(() => expect(rowNames()).toEqual(['sam', 'kim']));
        expect(rowFor('sam').querySelector('.llm-key-row-hint').textContent).toBe('•••• 4321');
    });

    it('shows the server message for a rejected key and keeps the input', async () => {
        llmKeyService.registerKey.mockRejectedValue(
            apiError(400, 'INVALID_LLM_KEY', 'The model server did not accept this key.'),
        );

        renderModelAccess();
        await openGrantForm();

        fillGrantForm(NEW_USER_ID, VALID_KEY);
        fireEvent.click(saveButton());

        await waitFor(() => {
            expect(document.querySelector('.llm-key-form-error').textContent)
                .toBe('The model server did not accept this key.');
        });
        expect(keyInput().value).toBe(VALID_KEY);
        expect(rowNames()).toEqual(['sam']);
    });

    it('never shows a server message that echoes the key', async () => {
        llmKeyService.registerKey.mockRejectedValue(
            apiError(400, 'INVALID_LLM_KEY', `Key ${VALID_KEY} was refused.`),
        );

        renderModelAccess();
        await openGrantForm();

        fillGrantForm(NEW_USER_ID, VALID_KEY);
        fireEvent.click(saveButton());

        await waitFor(() => {
            expect(document.querySelector('.llm-key-form-error').textContent)
                .toBe('The model server did not accept this key.');
        });
    });

    it('offers a retry when the model server cannot check the key', async () => {
        llmKeyService.registerKey.mockRejectedValue(apiError(503, 'LLM_KEY_VALIDATION_UNAVAILABLE'));

        renderModelAccess();
        await openGrantForm();

        fillGrantForm(NEW_USER_ID, VALID_KEY);
        fireEvent.click(saveButton());

        await waitFor(() => {
            expect(document.querySelector('.llm-key-form-error').textContent)
                .toBe("Couldn't reach the model server to check this key. Try again.");
        });
        expect(saveButton().disabled).toBe(false);
        expect(keyInput().value).toBe(VALID_KEY);
    });

    it('closes the form when the admin role was taken away', async () => {
        llmKeyService.registerKey.mockRejectedValue(apiError(403));

        renderModelAccess();
        await openGrantForm();

        fillGrantForm(NEW_USER_ID, VALID_KEY);
        fireEvent.click(saveButton());

        await waitFor(() => expect(screen.queryByLabelText('API key')).toBeNull());
        expect(toast.error).toHaveBeenCalledWith('You no longer have permission to manage model access.');
    });
});

describe('ModelAccessSettings replacing', () => {
    it('fixes the user id and updates the row in place', async () => {
        llmKeyService.findKeys.mockResolvedValue(paged([
            summary({userId: SECOND_USER_ID, username: 'kim'}),
            summary(),
        ]));
        llmKeyService.registerKey.mockResolvedValue(summary({keyHint: '4321'}));

        renderModelAccess();

        await waitFor(() => expect(rows()).toHaveLength(2));

        fireEvent.click(within(rowFor('sam')).getByRole('button', {name: 'Replace key'}));

        const userIdInput = screen.getByLabelText('User ID');
        expect(userIdInput.value).toBe(FIRST_USER_ID);
        expect(userIdInput.readOnly).toBe(true);

        fireEvent.change(keyInput(), {target: {value: VALID_KEY}});
        fireEvent.click(saveButton());

        await waitFor(() => expect(rowFor('sam').querySelector('.llm-key-row-hint').textContent).toBe('•••• 4321'));
        expect(rowNames()).toEqual(['kim', 'sam']);
        expect(llmKeyService.registerKey).toHaveBeenCalledWith(FIRST_USER_ID, VALID_KEY);
    });
});

describe('ModelAccessSettings removing', () => {
    beforeEach(() => {
        llmKeyService.findKeys.mockResolvedValue(paged([summary()]));
    });

    async function confirmRemoval() {
        await waitFor(() => expect(rows()).toHaveLength(1));

        fireEvent.click(within(rowFor('sam')).getByRole('button', {name: 'Remove access'}));

        const dialog = screen.getByRole('dialog');
        expect(dialog.textContent).toContain('Remove model access for sam?');
        expect(dialog.textContent).toContain('They lose it on their next message.');

        fireEvent.click(within(dialog).getByRole('button', {name: 'Remove access'}));
    }

    it('drops the row once the key is removed', async () => {
        llmKeyService.removeKey.mockResolvedValue(null);

        renderModelAccess();
        await confirmRemoval();

        await waitFor(() => expect(rows()).toHaveLength(0));
        expect(llmKeyService.removeKey).toHaveBeenCalledWith(FIRST_USER_ID);
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(toast).not.toHaveBeenCalled();
    });

    it('drops the row and says so when someone else already removed it', async () => {
        llmKeyService.removeKey.mockRejectedValue(apiError(404));

        renderModelAccess();
        await confirmRemoval();

        await waitFor(() => expect(rows()).toHaveLength(0));
        expect(toast).toHaveBeenCalledWith('Already removed');
    });

    it('keeps the row and explains any other failure', async () => {
        llmKeyService.removeKey.mockRejectedValue(apiError(500));

        renderModelAccess();
        await confirmRemoval();

        await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('alert')).toBeDefined());
        expect(rows()).toHaveLength(1);
    });
});
