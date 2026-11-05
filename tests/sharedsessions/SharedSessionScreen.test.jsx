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

const banner = (container) => container.querySelector('.shared-session-status-banner').textContent;

describe('SharedSessionScreen conversation mode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows the chat name and who is in it, with pending invitees marked', async () => {
        const container = await renderConversation();

        expect(container.querySelector('.shared-session-header').textContent).toContain('Trip planning');

        const chips = Array.from(container.querySelectorAll('.shared-session-participant-chip')).map((chip) => chip.textContent);
        expect(chips).toEqual(['Alex', 'Sam', 'riley (invited)']);
        expect(container.querySelector('.shared-session-participant-chip--pending').title).toBe('Riley Reed');
    });

    it('shows no turn banner, only the assistant responding', async () => {
        const idle = await renderConversation();
        expect(banner(idle)).toBe('');
        cleanup();

        const running = await renderConversation({activeRun: {runId: 'run-1'}});
        expect(banner(running)).toBe('The assistant is responding…');
    });

    it('says when the chat ended or expired', async () => {
        const closed = await renderConversation({session: {...CONVERSATION, status: 'CLOSED'}});
        expect(banner(closed)).toBe('This chat ended.');
        cleanup();

        const expired = await renderConversation({session: {...CONVERSATION, status: 'EXPIRED'}});
        expect(banner(expired)).toBe('This chat expired.');
    });

    it('invites the group to message and limits the message length', async () => {
        await renderConversation();

        const input = screen.getByLabelText('Your message');

        expect(input.getAttribute('placeholder')).toBe('Message the group…');
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

    it('offers the owner Add people and the others nothing', async () => {
        await renderConversation();
        expect(screen.getByRole('button', {name: 'Add people'})).toBeTruthy();
        cleanup();

        await renderConversation({viewerUserId: SAM});
        expect(screen.queryByRole('button', {name: 'Add people'})).toBeNull();
    });

    it('does not offer Add people in an agent session', async () => {
        await renderConversation({session: {...SESSION, ownerUserId: ALEX}});

        expect(screen.queryByRole('button', {name: 'Add people'})).toBeNull();
    });

    it('disables Add people when the chat is full', async () => {
        const people = Array.from({length: 6}, (unused, index) => ({userId: `u-${index}`, seat: index + 2, name: `P${index}`}));
        await renderConversation({session: {...CONVERSATION, participants: [...CONVERSATION.participants, ...people]}});

        const button = screen.getByRole('button', {name: 'Add people'});

        expect(button.disabled).toBe(true);
        expect(button.title).toBe('This chat is full.');
    });

    it('invites people from the dialog and shows them as invited', async () => {
        userDirectoryService.search.mockResolvedValue([{userId: 'u-carol', username: 'carol', displayName: 'Carol Chan'}]);
        sharedSessionService.inviteToSession.mockResolvedValue([]);
        const container = await renderConversation();

        fireEvent.click(screen.getByRole('button', {name: 'Add people'}));
        const dialog = screen.getByRole('dialog');
        fireEvent.focus(within(dialog).getByRole('combobox'));
        fireEvent.click(await within(dialog).findByRole('option', {name: /carol/}));
        fireEvent.click(within(dialog).getByRole('button', {name: /^Invit/}));

        await waitFor(() => expect(sharedSessionService.inviteToSession).toHaveBeenCalledWith('session-1', ['carol']));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        const chips = Array.from(container.querySelectorAll('.shared-session-participant-chip')).map((chip) => chip.textContent);
        expect(chips).toEqual(['Alex', 'Sam', 'riley (invited)', 'carol (invited)']);
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

        fireEvent.click(screen.getByRole('button', {name: 'Add people'}));
        const dialog = screen.getByRole('dialog');
        fireEvent.focus(within(dialog).getByRole('combobox'));
        fireEvent.click(await within(dialog).findByRole('option', {name: /carol/}));
        fireEvent.click(within(dialog).getByRole('button', {name: /^Invit/}));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        const chipTexts = () => Array.from(container.querySelectorAll('.shared-session-participant-chip')).map((chip) => chip.textContent);
        expect(chipTexts()).toContain('carol (invited)');

        useSharedSessionStream.mockReturnValue(stream({...CONVERSATION, pendingInvitees: []}));
        rerender(tree());

        expect(chipTexts()).toEqual(['Alex', 'Sam']);
    });

    it('tells the owner they end sharing for everyone', async () => {
        const container = await renderConversation();

        expect(container.querySelector('.leave-session-trigger').getAttribute('aria-label')).toBe('End sharing for everyone');
    });

    it('tells others they are only leaving', async () => {
        const container = await renderConversation({viewerUserId: SAM});

        expect(container.querySelector('.leave-session-trigger').getAttribute('aria-label')).toBe('Leave chat');
    });

    it('keeps the agent wording for an agent session', async () => {
        const container = await renderAs(SAM);

        expect(container.querySelector('.leave-session-trigger').getAttribute('aria-label')).toBe('Leave session');
    });

    it('labels messages by who sent them and shows the assistant like a private chat', async () => {
        const container = await renderConversation({
            messages: [
                {_key: 'a', type: 'USER', text: 'hi', senderName: 'Sam', mine: false},
                {_key: 'b', type: 'USER', text: 'hello', senderName: 'Alex', mine: true},
                {_key: 'c', type: 'ASSISTANT', text: 'Hello both'},
            ],
        });

        const senders = Array.from(container.querySelectorAll('.shared-session-message-sender')).map((node) => node.textContent);
        expect(senders).toEqual(['Sam', 'You']);
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
