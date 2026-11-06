import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, cleanup, fireEvent, waitFor, screen, within} from '@testing-library/react';
import {MemoryRouter, Route, Routes} from 'react-router';

vi.mock('../../src/hooks/useSharedSessionStream.js', () => ({default: vi.fn()}));

vi.mock('../../src/service/AuthService.js', () => ({default: {getUserId: vi.fn()}}));

vi.mock('../../src/hooks/useSoundPlayer.js', () => ({
    default: () => ({playSound: () => undefined, attachSoundSurface: () => undefined}),
}));

vi.mock('../../src/hooks/useScrollToBottom.js', () => ({
    default: () => ({scrollContainerRef: {current: null}, isScrolledAwayFromBottom: false, scrollToBottom: () => undefined}),
}));

vi.mock('../../src/hooks/useKeyboardInset.js', () => ({default: () => 0}));

vi.mock('../../src/service/SharedSessionService.js', async (importOriginal) => ({
    ...await importOriginal(),
    default: {
        send: vi.fn(),
        commands: vi.fn().mockResolvedValue([]),
        cancel: vi.fn(),
        leave: vi.fn(),
        answerPrompt: vi.fn(),
        inviteToSession: vi.fn(),
    },
}));

vi.mock('../../src/service/UserDirectoryService.js', () => ({
    default: {search: vi.fn().mockResolvedValue([])},
    DIRECTORY_PAGE_SIZE: 20,
}));

import SharedSessionScreen from '../../src/sharedsessions/SharedSessionScreen.jsx';
import useSharedSessionStream from '../../src/hooks/useSharedSessionStream.js';
import authService from '../../src/service/AuthService.js';
import sharedSessionService from '../../src/service/SharedSessionService.js';
import userDirectoryService from '../../src/service/UserDirectoryService.js';
import {EMPTY_TRANSCRIPT, applyFrame} from '../../src/sharedsessions/sharedSessionTranscript.js';
import {HIDDEN_FROM_VIEWER_TEXT} from '../../src/chat/message/hiddenSections.js';

const ALEX = 'user-alex';
const SAM = 'user-sam';
const LOCK_TEXT = 'Hidden from you until everyone has played.';

const SESSION = {
    id: 'session-1',
    agentName: 'feud',
    status: 'ACTIVE',
    participants: [
        {userId: ALEX, seat: 0, name: 'Alex'},
        {userId: SAM, seat: 1, name: 'Sam'},
    ],
    turn: {userIds: [SAM], next: 'answer', over: false},
    prompt: null,
};

const REPLY = 'Thanks Alex.\n[[hidden:Sam]]\nAlex scored 120 points.\n[[/hidden]]\nSam, your turn.';

const frame = (event, data) => ({event, data: JSON.stringify(data)});

function transcriptFor(viewerUserId) {
    return [
        frame('RUN_STARTED', {
            runId: 'run-1',
            input: {messages: [{id: 'm-1', name: 'Alex', content: '[[hidden:Sam]]apple, banana, cherry[[/hidden]]'}]},
        }),
        frame('TEXT_MESSAGE_CONTENT', {delta: REPLY}),
        frame('RUN_FINISHED', {result: {message: {messageType: 'ASSISTANT', message: REPLY}}}),
    ].reduce((state, nextFrame) => applyFrame(state, nextFrame, viewerUserId), {...EMPTY_TRANSCRIPT, session: SESSION});
}

async function renderAs(viewerUserId) {
    const transcript = transcriptFor(viewerUserId);

    authService.getUserId.mockResolvedValue(viewerUserId);
    useSharedSessionStream.mockReturnValue({
        session: transcript.session,
        messages: transcript.messages,
        activeRun: null,
        loading: false,
        loadError: null,
        connected: true,
    });

    const rendered = render(
        <MemoryRouter initialEntries={['/shared-sessions/session-1']}>
            <Routes>
                <Route path="/shared-sessions/:sessionId" element={<SharedSessionScreen/>}/>
            </Routes>
        </MemoryRouter>
    );

    await waitFor(() => expect(useSharedSessionStream).toHaveBeenLastCalledWith(expect.objectContaining({viewerUserId})));

    return rendered.container;
}

describe('SharedSessionScreen hidden sections', () => {
    let writeText;
    let originalClipboardDescriptor;

    beforeEach(() => {
        writeText = vi.fn().mockResolvedValue(undefined);
        originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
        Object.defineProperty(navigator, 'clipboard', {value: {writeText}, configurable: true});
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();

        if (originalClipboardDescriptor) {
            Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
            return;
        }

        delete navigator.clipboard;
    });

    it('shows the participant a section is hidden from a lock, not the text', async () => {
        const container = await renderAs(SAM);

        expect(container.querySelectorAll('.markdown-body blockquote')).toHaveLength(2);
        expect(container.textContent).toContain(LOCK_TEXT);
        expect(container.textContent).not.toContain('apple');
        expect(container.textContent).not.toContain('scored 120');
        expect(container.textContent).not.toContain('[[');
        expect(container.textContent).toContain('Sam, your turn.');
    });

    it('shows everyone else the text under a caption naming who cannot see it', async () => {
        const container = await renderAs(ALEX);

        expect(container.textContent).toContain('apple, banana, cherry');
        expect(container.textContent).toContain('Alex scored 120 points.');
        expect(container.textContent).toContain('Hidden from Sam');
        expect(container.textContent).not.toContain(LOCK_TEXT);
        expect(container.textContent).not.toContain('[[');
    });

    it('copies only what the viewer can see', async () => {
        const container = await renderAs(SAM);

        fireEvent.click(container.querySelector('.message-copy-button'));

        await waitFor(() => expect(writeText).toHaveBeenCalled());
        const copied = writeText.mock.calls[0][0];
        expect(copied).toContain(HIDDEN_FROM_VIEWER_TEXT);
        expect(copied).not.toContain('scored 120');
        expect(copied).not.toContain('[[');
    });
});


const CONVERSATION = {
    id: 'session-1',
    mode: 'CONVERSATION',
    agentName: null,
    name: 'Trip planning',
    status: 'ACTIVE',
    ownerUserId: ALEX,
    participants: [
        {userId: ALEX, seat: 0, name: 'Alex'},
        {userId: SAM, seat: 1, name: 'Sam'},
    ],
    pendingInvitees: [{userId: 'u-riley', username: 'riley', displayName: 'Riley Reed'}],
    turn: null,
    prompt: null,
};

async function renderConversation({session = CONVERSATION, viewerUserId = ALEX, activeRun = null, messages = []} = {}) {
    authService.getUserId.mockResolvedValue(viewerUserId);
    useSharedSessionStream.mockReturnValue({session, messages, activeRun, loading: false, loadError: null, connected: true});

    const rendered = render(
        <MemoryRouter initialEntries={['/shared-sessions/session-1']}>
            <Routes>
                <Route path="/shared-sessions/:sessionId" element={<SharedSessionScreen/>}/>
                <Route path="/shared-sessions" element={<div>list</div>}/>
            </Routes>
        </MemoryRouter>
    );

    await waitFor(() => expect(useSharedSessionStream).toHaveBeenLastCalledWith(expect.objectContaining({viewerUserId})));

    return rendered.container;
}

const subtitle = (container) => container.querySelector('.chat-header-subtitle').textContent;
const openMenu = () => fireEvent.click(screen.getByRole('button', {name: 'Chat options'}));
const peopleNames = (container) => Array.from(container.querySelectorAll('.shared-session-person-name')).map((node) => node.textContent);

describe('SharedSessionScreen conversation mode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows the chat name and who is in it, with pending invitees marked', async () => {
        const container = await renderConversation();

        expect(screen.getByRole('heading', {name: 'Trip planning'})).toBeTruthy();
        expect(subtitle(container)).toBe('2 people · 1 invited');

        openMenu();

        expect(peopleNames(container)).toEqual(['Alex', 'Sam', 'riley']);
        expect(container.querySelector('.shared-session-person--pending').title).toBe('Riley Reed');
    });

    it('links back to the shared chats list', async () => {
        await renderConversation();

        expect(screen.getByRole('link', {name: 'Back to shared chats'}).getAttribute('href')).toBe('/shared-sessions');
    });

    it('shows status in the header subtitle instead of a banner', async () => {
        const idle = await renderConversation();
        expect(idle.querySelector('.shared-session-status-banner')).toBeNull();
        expect(idle.querySelector('.chat-header-progress--active')).toBeNull();
        cleanup();

        const running = await renderConversation({activeRun: {runId: 'run-1'}});
        expect(subtitle(running)).toBe('Assistant is responding…');
        expect(running.querySelector('.chat-header-progress--active')).not.toBeNull();
        expect(running.querySelector('.shared-session-status-banner')).toBeNull();
    });

    it('says when the chat ended or expired', async () => {
        const closed = await renderConversation({session: {...CONVERSATION, status: 'CLOSED'}});
        expect(subtitle(closed)).toBe('Ended · read only');
        cleanup();

        const expired = await renderConversation({session: {...CONVERSATION, status: 'EXPIRED'}});
        expect(subtitle(expired)).toBe('Expired · read only');
    });

    it('says when it is reconnecting', async () => {
        authService.getUserId.mockResolvedValue(ALEX);
        useSharedSessionStream.mockReturnValue({session: CONVERSATION, messages: [], activeRun: null, loading: false, loadError: null, connected: false});
        const {container} = render(
            <MemoryRouter initialEntries={['/shared-sessions/session-1']}>
                <Routes><Route path="/shared-sessions/:sessionId" element={<SharedSessionScreen/>}/></Routes>
            </MemoryRouter>
        );

        await waitFor(() => expect(subtitle(container)).toBe('Reconnecting…'));
    });

    it('invites the group to message and limits the message length', async () => {
        await renderConversation();

        const input = screen.getByLabelText('Your message');

        expect(input.getAttribute('placeholder')).toBe('Message the group');
        expect(input.maxLength).toBe(8000);
    });

    it('locks the composer while a run is active', async () => {
        await renderConversation({activeRun: {runId: 'run-1'}});

        expect(screen.getByLabelText('Your message').disabled).toBe(true);
    });

    it('sends a typed message through the session', async () => {
        sharedSessionService.send.mockResolvedValue({runId: 'run-2'});
        await renderConversation();

        fireEvent.change(screen.getByLabelText('Your message'), {target: {value: 'hello all'}});
        fireEvent.keyDown(screen.getByLabelText('Your message'), {key: 'Enter'});

        await waitFor(() => expect(sharedSessionService.send).toHaveBeenCalledWith('session-1', 'hello all', {attachmentIds: [], commands: []}));
    });

    it('offers Analyze on a failure when the session allows /logs, and sends it through the session', async () => {
        const failure = {
            _key: 'e1', type: 'ERROR', text: 'An unexpected error occurred. Please try again.', code: 'internal',
            occurredAt: '2026-11-05T17:27:20.138Z', analyzable: true, failedCommands: [],
        };
        sharedSessionService.commands.mockResolvedValue([{command: 'logs', name: 'logs'}]);
        sharedSessionService.send.mockResolvedValue({runId: 'run-3'});
        await renderConversation({messages: [failure]});

        fireEvent.click(await screen.findByRole('button', {name: 'Analyze this error'}));

        await waitFor(() => expect(sharedSessionService.send).toHaveBeenCalledWith('session-1',
            expect.stringMatching(/^Analyze the error shown in this chat at 2026-11-05T17:27:20Z: /), {commands: ['logs']}));
        expect(sharedSessionService.commands).toHaveBeenCalledWith('session-1', 'logs');
    });

    it('offers no Analyze when the session does not allow /logs', async () => {
        sharedSessionService.commands.mockResolvedValue([]);
        await renderConversation({messages: [{
            _key: 'e1', type: 'ERROR', text: 'An unexpected error occurred.', code: 'internal', analyzable: true,
        }]});

        await waitFor(() => expect(sharedSessionService.commands).toHaveBeenCalled());
        expect(screen.queryByRole('button', {name: 'Analyze this error'})).toBeNull();
    });

    it('offers the owner Add people and the others nothing', async () => {
        await renderConversation();
        openMenu();
        expect(screen.getByRole('button', {name: 'Add people'})).toBeTruthy();
        cleanup();

        await renderConversation({viewerUserId: SAM});
        openMenu();
        expect(screen.queryByRole('button', {name: 'Add people'})).toBeNull();
    });

    it('does not offer Add people in an agent session', async () => {
        await renderConversation({session: {...SESSION, ownerUserId: ALEX}});
        openMenu();

        expect(screen.queryByRole('button', {name: 'Add people'})).toBeNull();
    });

    it('disables Add people when the chat is full', async () => {
        const people = Array.from({length: 6}, (unused, index) => ({userId: `u-${index}`, seat: index + 2, name: `P${index}`}));
        await renderConversation({session: {...CONVERSATION, participants: [...CONVERSATION.participants, ...people]}});
        openMenu();

        const button = screen.getByRole('button', {name: 'Add people'});

        expect(button.disabled).toBe(true);
        expect(button.title).toBe('This chat is full.');
    });

    it('invites people from the dialog and shows them as invited', async () => {
        userDirectoryService.search.mockResolvedValue([{userId: 'u-carol', username: 'carol', displayName: 'Carol Chan'}]);
        sharedSessionService.inviteToSession.mockResolvedValue([]);
        const container = await renderConversation();

        openMenu();
        fireEvent.click(screen.getByRole('button', {name: 'Add people'}));
        const dialog = screen.getByRole('dialog');
        fireEvent.focus(within(dialog).getByRole('combobox'));
        fireEvent.click(await within(dialog).findByRole('option', {name: /carol/}));
        fireEvent.click(within(dialog).getByRole('button', {name: /^Invit/}));

        await waitFor(() => expect(sharedSessionService.inviteToSession).toHaveBeenCalledWith('session-1', ['carol']));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(subtitle(container)).toBe('2 people · 2 invited');
        openMenu();
        expect(peopleNames(container)).toEqual(['Alex', 'Sam', 'riley', 'carol']);
    });

    it('drops locally invited people once the server sends a new session state', async () => {
        userDirectoryService.search.mockResolvedValue([{userId: 'u-carol', username: 'carol', displayName: 'Carol Chan'}]);
        sharedSessionService.inviteToSession.mockResolvedValue([]);
        authService.getUserId.mockResolvedValue(ALEX);
        const stream = (session) => ({session, messages: [], activeRun: null, loading: false, loadError: null, connected: true});
        useSharedSessionStream.mockReturnValue(stream(CONVERSATION));
        const tree = () => (
            <MemoryRouter initialEntries={['/shared-sessions/session-1']}>
                <Routes><Route path="/shared-sessions/:sessionId" element={<SharedSessionScreen/>}/></Routes>
            </MemoryRouter>
        );
        const {container, rerender} = render(tree());
        await waitFor(() => expect(useSharedSessionStream).toHaveBeenLastCalledWith(expect.objectContaining({viewerUserId: ALEX})));

        openMenu();
        fireEvent.click(screen.getByRole('button', {name: 'Add people'}));
        const dialog = screen.getByRole('dialog');
        fireEvent.focus(within(dialog).getByRole('combobox'));
        fireEvent.click(await within(dialog).findByRole('option', {name: /carol/}));
        fireEvent.click(within(dialog).getByRole('button', {name: /^Invit/}));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        openMenu();
        expect(peopleNames(container)).toContain('carol');

        useSharedSessionStream.mockReturnValue(stream({...CONVERSATION, pendingInvitees: []}));
        rerender(tree());

        expect(peopleNames(container)).toEqual(['Alex', 'Sam']);
    });

    it('tells the owner they end sharing for everyone', async () => {
        await renderConversation();
        openMenu();

        expect(screen.getByRole('button', {name: 'End sharing for everyone'})).toBeTruthy();
        expect(screen.queryByRole('button', {name: 'Leave chat'})).toBeNull();
    });

    it('tells others they are only leaving', async () => {
        await renderConversation({viewerUserId: SAM});
        openMenu();

        expect(screen.getByRole('button', {name: 'Leave chat'})).toBeTruthy();
        expect(screen.queryByRole('button', {name: 'End sharing for everyone'})).toBeNull();
    });

    it('keeps the agent wording for an agent session', async () => {
        await renderAs(SAM);
        openMenu();

        expect(screen.getByRole('button', {name: 'Leave session'})).toBeTruthy();
    });

    it('asks before leaving, and goes back to the list once left', async () => {
        sharedSessionService.leave.mockResolvedValue(undefined);
        await renderConversation({viewerUserId: SAM});
        openMenu();

        fireEvent.click(screen.getByRole('button', {name: 'Leave chat'}));
        expect(sharedSessionService.leave).not.toHaveBeenCalled();
        expect(screen.getByText('Leave this chat?')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', {name: 'Leave chat'}));

        await waitFor(() => expect(sharedSessionService.leave).toHaveBeenCalledWith('session-1'));
        await waitFor(() => expect(screen.getByText('list')).toBeTruthy());
    });

    it('keeps the chat when the confirmation is declined', async () => {
        await renderConversation();
        openMenu();

        fireEvent.click(screen.getByRole('button', {name: 'End sharing for everyone'}));
        fireEvent.click(screen.getByRole('button', {name: 'Keep sharing'}));

        expect(sharedSessionService.leave).not.toHaveBeenCalled();
        expect(screen.getByRole('button', {name: 'End sharing for everyone'})).toBeTruthy();
    });

    it('offers no leave action once the chat has ended', async () => {
        await renderConversation({session: {...CONVERSATION, status: 'CLOSED'}});
        openMenu();

        expect(screen.queryByRole('button', {name: 'End sharing for everyone'})).toBeNull();
    });

    it('labels messages by who sent them and shows the assistant like a private chat', async () => {
        const container = await renderConversation({
            messages: [
                {_key: 'a', type: 'USER', text: 'hi', senderName: 'Sam', mine: false},
                {_key: 'b', type: 'USER', text: 'hello', senderName: 'Alex', mine: true},
                {_key: 'c', type: 'ASSISTANT', text: 'Hello both'},
            ],
        });

        const senders = Array.from(container.querySelectorAll('.message-sender')).map((node) => node.textContent);
        expect(senders).toEqual(['Sam', 'You', 'Izzy-Bot']);
    });

    const stopButton = () => screen.queryByRole('button', {name: 'Stop response'});
    const OTHERS_MESSAGE = {_key: 'u1', type: 'USER', text: 'hi', senderName: 'Sam', mine: false};
    const MY_MESSAGE = {_key: 'u2', type: 'USER', text: 'hi', senderName: 'Sam', mine: true};

    it('shows the owner the stop button during someone else\'s run', async () => {
        await renderConversation({activeRun: {runId: 'run-1'}, messages: [OTHERS_MESSAGE]});

        expect(stopButton()).not.toBeNull();
    });

    it('hides the stop button from a non-owner who did not send the last message', async () => {
        await renderConversation({viewerUserId: SAM, activeRun: {runId: 'run-1'}, messages: [OTHERS_MESSAGE]});

        expect(stopButton()).toBeNull();
    });

    it('shows the stop button to a non-owner who sent the last message', async () => {
        await renderConversation({viewerUserId: SAM, activeRun: {runId: 'run-1'}, messages: [MY_MESSAGE]});

        expect(stopButton()).not.toBeNull();
    });

    it('shows no stop button when no run is active', async () => {
        await renderConversation({messages: [MY_MESSAGE]});

        expect(stopButton()).toBeNull();
    });
});
