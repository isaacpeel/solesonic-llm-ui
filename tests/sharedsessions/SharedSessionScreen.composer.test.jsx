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

vi.mock('../../src/hooks/useAttachmentUrl.js', () => ({
    default: vi.fn(() => ({objectUrl: 'blob:resolved', loading: false, error: null})),
}));

vi.mock('../../src/service/AttachmentService.js', () => ({
    default: {
        stageAttachment: vi.fn(),
        deleteAttachment: vi.fn(),
        attachmentExists: vi.fn(),
    },
}));

vi.mock('../../src/service/ChatModelService.js', async (importOriginal) => ({
    ...await importOriginal(),
    default: {options: vi.fn(), select: vi.fn(), reset: vi.fn()},
}));

vi.mock('../../src/util/attachmentDraftStorage.js', () => ({
    saveAttachmentDraft: vi.fn(),
    clearAttachmentDraft: vi.fn(),
    restoreValidatedAttachmentDraft: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/util/downscaleImage.js', () => ({
    downscaleImage: vi.fn(async (candidateFile) => candidateFile),
}));

vi.mock('../../src/util/attachmentObjectUrlCache.js', () => ({
    primeAttachmentObjectUrl: vi.fn(),
}));

vi.mock('../../src/service/SharedSessionService.js', async (importOriginal) => ({
    ...await importOriginal(),
    default: {
        send: vi.fn(),
        commands: vi.fn(),
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
import sharedSessionService, {SESSION_ERROR_CODES} from '../../src/service/SharedSessionService.js';
import attachmentService from '../../src/service/AttachmentService.js';
import chatModelService from '../../src/service/ChatModelService.js';
import {ApiError} from '../../src/client/ApiClient.js';
import {SharedDataContext} from '../../src/context/SharedDataContext.jsx';
import {restoreValidatedAttachmentDraft, saveAttachmentDraft, clearAttachmentDraft} from '../../src/util/attachmentDraftStorage.js';

const ALEX = 'user-alex';
const SAM = 'user-sam';

const CONVERSATION = {
    id: 'session-1',
    chatId: 'chat-1',
    mode: 'CONVERSATION',
    agentName: null,
    name: 'Trip planning',
    status: 'ACTIVE',
    ownerUserId: ALEX,
    model: 'qwen3-8b',
    participants: [
        {userId: ALEX, seat: 0, name: 'Alex'},
        {userId: SAM, seat: 1, name: 'Sam'},
    ],
    pendingInvitees: [],
    turn: null,
    prompt: null,
};

const AGENT_SESSION = {
    id: 'session-1',
    chatId: 'chat-2',
    mode: 'AGENT',
    agentName: 'feud',
    status: 'ACTIVE',
    participants: CONVERSATION.participants,
    turn: {userIds: [ALEX], next: 'answer', over: false},
    prompt: null,
};

const WEB_SEARCH = {commandType: 'tool', command: 'web_search', name: 'web_search', description: 'Search the web'};
const MODEL_COMMAND = {commandType: 'model', command: 'model', name: 'model', description: 'Pick the model'};

const MODEL_OPTIONS = {
    models: [{id: 'qwen3-8b', ownedBy: 'local'}, {id: 'openai/gpt-4o', ownedBy: 'openai'}],
    defaultModel: 'qwen3-8b',
    selectedModel: null,
    activeAgent: null,
};

const stream = (session, messages = []) => ({session, messages, activeRun: null, loading: false, loadError: null, connected: true});

const tree = () => (
    <MemoryRouter initialEntries={['/shared-sessions/session-1']}>
        <Routes>
            <Route path="/shared-sessions/:sessionId" element={<SharedSessionScreen/>}/>
            <Route path="/shared-sessions" element={<div>list</div>}/>
        </Routes>
    </MemoryRouter>
);

async function renderScreen({session = CONVERSATION, messages = [], viewerUserId = ALEX} = {}) {
    authService.getUserId.mockResolvedValue(viewerUserId);
    useSharedSessionStream.mockReturnValue(stream(session, messages));

    const rendered = render(tree());

    await waitFor(() => expect(useSharedSessionStream).toHaveBeenLastCalledWith(expect.objectContaining({viewerUserId})));

    return rendered;
}

const imageFile = (name = 'chart.png') => new File(['pixels'], name, {type: 'image/png'});

async function attach(container, file = imageFile()) {
    const fileInput = container.querySelector('input[type="file"]');

    fireEvent.change(fileInput, {target: {files: [file]}});

    await waitFor(() => expect(attachmentService.stageAttachment).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('.composer-attachment-tray .attachment-thumbnail')).toBeTruthy());
    await waitFor(() => expect(container.querySelector('.attachment-thumbnail-overlay')).toBeNull());
}

const messageBox = () => screen.getByLabelText('Your message');

beforeEach(() => {
    vi.stubGlobal('URL', {createObjectURL: vi.fn(() => 'blob:local-1'), revokeObjectURL: vi.fn()});
    attachmentService.stageAttachment.mockResolvedValue({id: 'att-1'});
    attachmentService.deleteAttachment.mockResolvedValue(null);
    sharedSessionService.send.mockResolvedValue({runId: 'run-2'});
    sharedSessionService.commands.mockResolvedValue([]);
    chatModelService.options.mockResolvedValue(MODEL_OPTIONS);
    chatModelService.select.mockResolvedValue(null);
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('SharedSessionScreen conversation composer', () => {
    it('offers attaching files, which an agent session does not', async () => {
        const conversation = await renderScreen();
        expect(conversation.container.querySelector('input[type="file"]')).toBeTruthy();
        cleanup();

        const agent = await renderScreen({session: AGENT_SESSION});
        expect(agent.container.querySelector('input[type="file"]')).toBeNull();
    });

    it('sends the staged attachment ids with the text, then clears the tray', async () => {
        const {container} = await renderScreen();

        await attach(container);
        fireEvent.change(messageBox(), {target: {value: 'look at this'}});
        fireEvent.keyDown(messageBox(), {key: 'Enter'});

        await waitFor(() => expect(sharedSessionService.send).toHaveBeenCalledWith('session-1', 'look at this', {attachmentIds: ['att-1'], commands: []}));
        await waitFor(() => expect(container.querySelector('.composer-attachment-tray .attachment-thumbnail')).toBeNull());
        expect(messageBox().value).toBe('');
    });

    it('allows a message that is only attachments', async () => {
        const {container} = await renderScreen();

        await attach(container);
        fireEvent.click(screen.getByRole('button', {name: 'Send message'}));

        await waitFor(() => expect(sharedSessionService.send).toHaveBeenCalledWith('session-1', '', {attachmentIds: ['att-1'], commands: []}));
    });

    it('does not send an empty composer', async () => {
        await renderScreen();

        expect(screen.getByRole('button', {name: 'Send message'}).disabled).toBe(true);
        fireEvent.keyDown(messageBox(), {key: 'Enter'});

        expect(sharedSessionService.send).not.toHaveBeenCalled();
    });

    it('blocks the send and says why while an upload is still running', async () => {
        let finishUpload;
        attachmentService.stageAttachment.mockReturnValue(new Promise((resolve) => {
            finishUpload = resolve;
        }));
        const {container} = await renderScreen();

        fireEvent.change(container.querySelector('input[type="file"]'), {target: {files: [imageFile()]}});
        await waitFor(() => expect(attachmentService.stageAttachment).toHaveBeenCalled());
        fireEvent.change(messageBox(), {target: {value: 'wait for it'}});
        fireEvent.keyDown(messageBox(), {key: 'Enter'});

        expect(screen.getByRole('button', {name: 'Send message'}).disabled).toBe(true);
                expect(screen.getByText('Wait for uploads to finish.').closest('[aria-live]')).not.toBeNull();
        expect(sharedSessionService.send).not.toHaveBeenCalled();

        finishUpload({id: 'att-1'});

        await waitFor(() => expect(screen.getByRole('button', {name: 'Send message'}).disabled).toBe(false));
        expect(screen.queryByText('Wait for uploads to finish.')).toBeNull();
    });

    it('keeps the tray and the text when the send fails, and says why', async () => {
        sharedSessionService.send.mockRejectedValue(new ApiError({message: '409', status: 409, code: SESSION_ERROR_CODES.RUN_IN_PROGRESS}));
        const {container} = await renderScreen();

        await attach(container);
        fireEvent.change(messageBox(), {target: {value: 'look at this'}});
        fireEvent.keyDown(messageBox(), {key: 'Enter'});

        expect((await screen.findByRole('alert')).textContent).toBe('Still answering the last message.');
        expect(container.querySelector('.composer-attachment-tray .attachment-thumbnail')).toBeTruthy();
        expect(messageBox().value).toBe('look at this');
        expect(attachmentService.deleteAttachment).not.toHaveBeenCalled();
    });

    it('attaches an image pasted into the composer', async () => {
        await renderScreen();
        const pasted = imageFile('pasted.png');

        fireEvent.paste(messageBox(), {
            clipboardData: {
                items: [{kind: 'file', type: 'image/png', getAsFile: () => pasted}],
                getData: () => '',
            },
        });

        await waitFor(() => expect(attachmentService.stageAttachment).toHaveBeenCalledWith(pasted, ''));
    });
});

describe('SharedSessionScreen attachments in the transcript', () => {
    const OTHERS_UPLOAD = {
        _key: 'u1',
        type: 'USER',
        text: 'the chart',
        senderName: 'Sam',
        mine: false,
        attachments: [{id: 'att-9', fileName: 'chart.png', contentType: 'image/png', description: 'quarterly chart'}],
    };

    it('shows another participant\'s image and opens it in the lightbox', async () => {
        await renderScreen({messages: [OTHERS_UPLOAD]});

        expect(screen.getByAltText('quarterly chart')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', {name: 'Expand chart.png'}));

        const lightbox = screen.getByRole('dialog', {name: 'quarterly chart'});
        expect(within(lightbox).getByAltText('quarterly chart').getAttribute('src')).toBe('blob:resolved');

        fireEvent.click(within(lightbox).getByRole('button', {name: 'Close image'}));
        expect(screen.queryByRole('dialog', {name: 'quarterly chart'})).toBeNull();
    });

    it('shows the viewer\'s own upload the same way', async () => {
        await renderScreen({messages: [{...OTHERS_UPLOAD, mine: true, senderName: 'Alex'}]});

        expect(screen.getByAltText('quarterly chart')).toBeTruthy();
    });
});

describe('SharedSessionScreen model picker', () => {
    it('opens the picker for the shared chat from the model command', async () => {
        sharedSessionService.commands.mockResolvedValue([MODEL_COMMAND]);
        await renderScreen();

        fireEvent.change(messageBox(), {target: {value: '/mod'}});
        fireEvent.mouseDown(await screen.findByRole('option', {name: /\/model/}));

        await waitFor(() => expect(chatModelService.options).toHaveBeenCalledWith('chat-1'));
        expect(await screen.findByRole('listbox', {name: 'Models'})).toBeTruthy();
    });

    it('changes the model of the shared chat', async () => {
        sharedSessionService.commands.mockResolvedValue([MODEL_COMMAND]);
        await renderScreen();

        fireEvent.change(messageBox(), {target: {value: '/mod'}});
        fireEvent.mouseDown(await screen.findByRole('option', {name: /\/model/}));
        fireEvent.mouseDown(await screen.findByRole('option', {name: /openai\/gpt-4o/}));

        await waitFor(() => expect(chatModelService.select).toHaveBeenCalledWith('chat-1', 'openai/gpt-4o'));
        expect(await screen.findByText('Model set to openai/gpt-4o.')).toBeTruthy();
    });

    it('shows a model change made by another participant', async () => {
        const {rerender} = await renderScreen();
        expect(screen.queryByText(/Model set to/)).toBeNull();

        useSharedSessionStream.mockReturnValue(stream({...CONVERSATION, model: 'openai/gpt-4o'}));
        rerender(tree());

        expect(await screen.findByText('Model set to openai/gpt-4o.')).toBeTruthy();
    });

    it('keeps the current model when a session update leaves the model out', async () => {
        const {rerender} = await renderScreen();

        const {model: _omitted, ...withoutModel} = CONVERSATION;
        useSharedSessionStream.mockReturnValue(stream(withoutModel));
        rerender(tree());

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(screen.queryByText('Using the default model.')).toBeNull();
    });
});

describe('SharedSessionScreen slash commands', () => {
    it('lists the commands the shared catalogue allows', async () => {
        sharedSessionService.commands.mockResolvedValue([WEB_SEARCH]);
        await renderScreen();

        fireEvent.change(messageBox(), {target: {value: '/we'}});

        expect(await screen.findByRole('option', {name: /\/web_search/})).toBeTruthy();
        expect(sharedSessionService.commands).toHaveBeenCalledWith('session-1', 'we');
    });

    it('sends the selected command with the message', async () => {
        sharedSessionService.commands.mockResolvedValue([WEB_SEARCH]);
        await renderScreen();

        fireEvent.change(messageBox(), {target: {value: '/we'}});
        fireEvent.mouseDown(await screen.findByRole('option', {name: /\/web_search/}));
        fireEvent.change(messageBox(), {target: {value: 'latest news'}});
        fireEvent.keyDown(messageBox(), {key: 'Enter'});

        await waitFor(() => expect(sharedSessionService.send).toHaveBeenCalledWith('session-1', 'latest news', {attachmentIds: [], commands: ['web_search']}));
    });

    it('sends a command with no text', async () => {
        sharedSessionService.commands.mockResolvedValue([WEB_SEARCH]);
        await renderScreen();

        fireEvent.change(messageBox(), {target: {value: '/we'}});
        fireEvent.mouseDown(await screen.findByRole('option', {name: /\/web_search/}));
        fireEvent.click(screen.getByRole('button', {name: 'Send message'}));

        await waitFor(() => expect(sharedSessionService.send).toHaveBeenCalledWith('session-1', '', {attachmentIds: [], commands: ['web_search']}));
    });

    it('shows the server message when a command is refused, and keeps it selected', async () => {
        sharedSessionService.commands.mockResolvedValue([WEB_SEARCH]);
        sharedSessionService.send.mockRejectedValue(new ApiError({
            message: '400',
            status: 400,
            code: SESSION_ERROR_CODES.COMMAND_NOT_ALLOWED,
            serverMessage: 'The command /web_search is not allowed in shared chats.',
        }));
        await renderScreen();

        fireEvent.change(messageBox(), {target: {value: '/we'}});
        fireEvent.mouseDown(await screen.findByRole('option', {name: /\/web_search/}));
        fireEvent.change(messageBox(), {target: {value: 'latest news'}});
        fireEvent.keyDown(messageBox(), {key: 'Enter'});

        expect((await screen.findByRole('alert')).textContent).toBe('The command /web_search is not allowed in shared chats.');
        expect(messageBox().value).toBe('latest news');
        expect(document.querySelector('.selected-command-chip')).toBeTruthy();
    });

    it('does not ask the shared catalogue about slashes typed into an agent session', async () => {
        await renderScreen({session: AGENT_SESSION});

        fireEvent.change(messageBox(), {target: {value: '/we'}});
        await new Promise((resolve) => setTimeout(resolve, 400));

        expect(sharedSessionService.commands).not.toHaveBeenCalled();
    });
});

describe('SharedSessionScreen private draft isolation', () => {
    it('never reads or writes a draft in agent mode', async () => {
        await renderScreen({session: AGENT_SESSION});

        expect(restoreValidatedAttachmentDraft).not.toHaveBeenCalled();
        expect(saveAttachmentDraft).not.toHaveBeenCalled();
        expect(clearAttachmentDraft).not.toHaveBeenCalled();
    });

    it('only ever uses the draft of the shared chat itself, even while loading', async () => {
        authService.getUserId.mockResolvedValue(ALEX);
        useSharedSessionStream.mockReturnValue({session: null, messages: [], activeRun: null, loading: true, loadError: null, connected: false});
        const rendered = render(tree());
        await waitFor(() => expect(useSharedSessionStream).toHaveBeenLastCalledWith(expect.objectContaining({viewerUserId: ALEX})));

        expect(restoreValidatedAttachmentDraft).not.toHaveBeenCalled();
        expect(saveAttachmentDraft).not.toHaveBeenCalled();

        useSharedSessionStream.mockReturnValue(stream(CONVERSATION));
        rendered.rerender(tree());

        await waitFor(() => expect(restoreValidatedAttachmentDraft).toHaveBeenCalledWith('chat-1'));
        const draftKeys = [...restoreValidatedAttachmentDraft.mock.calls, ...saveAttachmentDraft.mock.calls].map((call) => call[0]);
        expect(draftKeys.every((key) => key === 'chat-1')).toBe(true);
    });
});

describe('SharedSessionScreen model errors', () => {
    it('does not call a healthy chat gone because the model endpoint answered 404', async () => {
        chatModelService.options.mockRejectedValue(new ApiError({message: '404', status: 404}));
        sharedSessionService.commands.mockResolvedValue([MODEL_COMMAND]);
        await renderScreen();

        fireEvent.change(messageBox(), {target: {value: '/mod'}});
        fireEvent.mouseDown(await screen.findByRole('option', {name: /\/model/}));

        await waitFor(() => expect(chatModelService.options).toHaveBeenCalled());
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(screen.queryByText(/no longer available/i)).toBeNull();
    });
});

describe('SharedSessionScreen leaving', () => {
    it('refreshes the chat history so the row drops out of the drawer', async () => {
        sharedSessionService.leave.mockResolvedValue(null);
        const setReloadHistoryTrigger = vi.fn();
        authService.getUserId.mockResolvedValue(SAM);
        useSharedSessionStream.mockReturnValue(stream(CONVERSATION));

        render(
            <MemoryRouter initialEntries={['/shared-sessions/session-1']}>
                <SharedDataContext.Provider value={{setReloadHistoryTrigger}}>
                    <Routes>
                        <Route path="/shared-sessions/:sessionId" element={<SharedSessionScreen/>}/>
                        <Route path="/shared-sessions" element={<div>list</div>}/>
                    </Routes>
                </SharedDataContext.Provider>
            </MemoryRouter>
        );

        fireEvent.click(await screen.findByRole('button', {name: 'Leave chat'}));
        fireEvent.click(await screen.findByRole('button', {name: 'Leave chat'}));

        await waitFor(() => expect(sharedSessionService.leave).toHaveBeenCalledWith('session-1'));
        await waitFor(() => expect(setReloadHistoryTrigger).toHaveBeenCalledTimes(1));
        const updater = setReloadHistoryTrigger.mock.calls[0][0];
        expect(updater(4)).toBe(5);
    });
});
