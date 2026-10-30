import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, cleanup, fireEvent, waitFor} from '@testing-library/react';
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

import SharedSessionScreen from '../../src/sharedsessions/SharedSessionScreen.jsx';
import useSharedSessionStream from '../../src/hooks/useSharedSessionStream.js';
import authService from '../../src/service/AuthService.js';
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
