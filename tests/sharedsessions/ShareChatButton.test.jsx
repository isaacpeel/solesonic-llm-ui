import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router';

vi.mock('../../src/context/useSharedData.jsx', () => ({useSharedData: vi.fn()}));
vi.mock('../../src/context/useChatTurn.jsx', () => ({useChatTurn: vi.fn()}));

vi.mock('../../src/service/UserDirectoryService.js', () => ({
    default: {search: vi.fn().mockResolvedValue([])},
    DIRECTORY_PAGE_SIZE: 20,
}));

vi.mock('../../src/service/ChatService.js', () => ({
    default: {findChatDetails: vi.fn()},
}));

vi.mock('react-toastify', () => ({toast: Object.assign(vi.fn(), {error: vi.fn()})}));

import ShareChatButton from '../../src/sharedsessions/ShareChatButton.jsx';
import {useSharedData} from '../../src/context/useSharedData.jsx';
import {useChatTurn} from '../../src/context/useChatTurn.jsx';
import chatService from '../../src/service/ChatService.js';

function renderButton({chatId = 'chat-1', chatHistory = [{_key: 'm1'}], turnInProgress = false, path = '/chat/chat-1'} = {}) {
    useSharedData.mockReturnValue({chatId, chatHistory});
    useChatTurn.mockReturnValue({turnInProgress});

    return render(<MemoryRouter initialEntries={[path]}><ShareChatButton/></MemoryRouter>);
}

beforeEach(() => {
    vi.clearAllMocks();
    chatService.findChatDetails.mockResolvedValue({name: 'Trip planning'});
});

describe('ShareChatButton', () => {
    it('is hidden on a new chat with nothing in it', () => {
        renderButton({chatId: null, chatHistory: []});

        expect(screen.queryByRole('button', {name: 'Share this chat'})).toBeNull();
    });

    it('is hidden while an open chat has not loaded any messages', () => {
        renderButton({chatHistory: []});

        expect(screen.queryByRole('button', {name: 'Share this chat'})).toBeNull();
    });

    it('is hidden when there are messages but no saved chat yet', () => {
        renderButton({chatId: null});

        expect(screen.queryByRole('button', {name: 'Share this chat'})).toBeNull();
    });

    it('is enabled on a chat with messages and opens the share dialog with the chat name', async () => {
        renderButton();

        const button = screen.getByRole('button', {name: 'Share this chat'});
        expect(button.disabled).toBe(false);

        fireEvent.click(button);

        expect((await screen.findByRole('dialog'))).toBeTruthy();
        expect(chatService.findChatDetails).toHaveBeenCalledWith('chat-1');
        expect(screen.getByLabelText('Chat name').value).toBe('Trip planning');
    });

    it('still opens with an empty name when the name cannot be read', async () => {
        chatService.findChatDetails.mockRejectedValue(new Error('down'));
        renderButton();

        fireEvent.click(screen.getByRole('button', {name: 'Share this chat'}));

        await screen.findByRole('dialog');
        expect(screen.getByLabelText('Chat name').value).toBe('');
    });

    it.each(['/shared-sessions', '/shared-sessions/abc', '/settings/general', '/interests/offers/o1'])('is hidden away from the chat, on %s', (path) => {
        renderButton({path});

        expect(screen.queryByRole('button', {name: 'Share this chat'})).toBeNull();
    });

    it('shows on the home chat route', () => {
        renderButton({path: '/'});

        expect(screen.getByRole('button', {name: 'Share this chat'})).toBeTruthy();
    });

    it('is disabled while a turn is in flight', () => {
        renderButton({turnInProgress: true});

        const button = screen.getByRole('button', {name: 'Share this chat'});
        expect(button.disabled).toBe(true);
        expect(button.getAttribute('title')).toBe('Wait for the response to finish.');
    });

    it('closes the dialog on cancel', async () => {
        renderButton();
        fireEvent.click(screen.getByRole('button', {name: 'Share this chat'}));
        await screen.findByRole('dialog');

        fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));

        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
