import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {useEffect} from 'react';
import {render, act, waitFor} from '@testing-library/react';

vi.mock('../../src/service/AuthService.js', () => ({
    default: {},
}));

vi.mock('../../src/service/ChatService.js', async (importOriginal) => {
    const originalModule = await importOriginal();

    return {
        ...originalModule,
        default: {
            ...originalModule.default,
            chatStream: vi.fn(),
            findChatDetails: vi.fn().mockResolvedValue({chatMessages: []}),
            chatStreamResume: vi.fn().mockResolvedValue('unavailable'),
            cancelStream: vi.fn().mockResolvedValue(null),
        },
    };
});

vi.mock('../../src/util/pageLifecycle.js', () => ({
    isPageHidden: vi.fn().mockReturnValue(false),
    observePageHidden: vi.fn().mockReturnValue(() => {}),
    observePageResumed: vi.fn().mockReturnValue(() => {}),
}));

vi.mock('react-toastify', () => ({
    toast: Object.assign(vi.fn(), {error: vi.fn()}),
}));

vi.mock('../../src/util/soundObjectUrlCache.js', () => ({
    acquireSoundObjectUrl: vi.fn().mockResolvedValue('blob:theme'),
    releaseSoundObjectUrl: vi.fn(),
}));

import {acquireSoundObjectUrl, releaseSoundObjectUrl} from '../../src/util/soundObjectUrlCache.js';
import chatService from '../../src/service/ChatService.js';
import {SharedDataProvider} from '../../src/context/SharedDataContext.jsx';
import {ChatTurnProvider} from '../../src/context/ChatTurnContext.jsx';
import {useChatTurn} from '../../src/context/useChatTurn.jsx';
import {useSharedData} from '../../src/context/useSharedData.jsx';

let latestTurn = null;
let latestShared = null;
let streamControl = null;

function TurnProbe() {
    latestTurn = useChatTurn();

    const {attachSoundSurface} = latestTurn.soundPlayer;

    useEffect(attachSoundSurface, [attachSoundSurface]);

    return null;
}

function SharedProbe() {
    latestShared = useSharedData();

    return null;
}

function Harness({showTurnProbe}) {
    return (
        <SharedDataProvider>
            <ChatTurnProvider>
                <SharedProbe/>
                {showTurnProbe && <TurnProbe/>}
            </ChatTurnProvider>
        </SharedDataProvider>
    );
}

function holdStreamOpen() {
    chatService.chatStream.mockImplementationOnce((payload, chatId, {onChunk, signal}) => {
        return new Promise((resolve, reject) => {
            streamControl = {onChunk, signal, finish: resolve};

            signal.addEventListener('abort', () => {
                reject(Object.assign(new Error('aborted'), {name: 'AbortError'}));
            });
        });
    });
}

function runStartedFrame() {
    return {
        event: 'RUN_STARTED',
        id: '1754062831234-0',
        data: JSON.stringify({
            type: 'RUN_STARTED',
            threadId: 'chat-1',
            runId: 'run-1',
            input: {threadId: 'chat-1', runId: 'run-1', messages: [{id: 'user-message-1', role: 'user', content: 'hi'}], tools: []},
        }),
    };
}

function contentFrame(delta, id) {
    return {event: 'TEXT_MESSAGE_CONTENT', id, data: JSON.stringify({type: 'TEXT_MESSAGE_CONTENT', messageId: 'wire-1', delta})};
}

function elicitationFrame() {
    return {
        event: 'TOOL_CALL_ARGS',
        id: '1754062831260-0',
        data: JSON.stringify({
            type: 'TOOL_CALL_ARGS',
            toolCallId: 'elicitation-1',
            delta: JSON.stringify({
                elicitationId: 'elicitation-1',
                chatId: 'chat-1',
                message: 'Pick an assignee',
                requestedSchema: {properties: {assignee: {type: 'string'}}},
            }),
        }),
    };
}

const THEME_SOUND_ID = 'c'.repeat(64);

function themeCueFrame() {
    return {
        event: 'TEXT_MESSAGE_START',
        id: '1754062831238-0',
        data: JSON.stringify({
            type: 'TEXT_MESSAGE_START',
            messageId: 'wire-1',
            role: 'assistant',
            metadata: {
                'solesonic/sound': {
                    cueId: 'sound-cue-theme',
                    soundId: THEME_SOUND_ID,
                    cue: 'theme',
                    playOnce: true,
                    source: {type: 'url', value: `/sounds/${THEME_SOUND_ID}`, mimeType: 'audio/mpeg'},
                },
            },
        }),
    };
}

function runFinishedFrame() {
    return {
        event: 'RUN_FINISHED',
        id: '1754062831300-0',
        data: JSON.stringify({
            type: 'RUN_FINISHED',
            threadId: 'chat-1',
            runId: 'run-1',
            result: {id: 'chat-1', message: {messageType: 'ASSISTANT', message: 'Here it is.'}},
        }),
    };
}

function lastHistoryEntry() {
    return latestShared.chatHistory[latestShared.chatHistory.length - 1];
}

async function startTurn(messageText) {
    holdStreamOpen();

    act(() => {
        latestTurn.setInputValue(messageText);
    });

    let submitPromise = null;

    act(() => {
        submitPromise = latestTurn.handleSubmit({});
    });

    await waitFor(() => {
        expect(streamControl).not.toBeNull();
    });

    act(() => {
        streamControl.onChunk(runStartedFrame());
    });

    return {submitPromise};
}

describe('ChatTurnProvider', () => {
    beforeEach(() => {
        latestTurn = null;
        latestShared = null;
        streamControl = null;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('renders the turn context', () => {
        render(<Harness showTurnProbe/>);

        expect(latestTurn).not.toBeNull();
        expect(latestTurn.loading).toBe(false);
    });

    it('keeps the turn streaming while the chat screen is unmounted, and shows it live on return', async () => {
        const {rerender} = render(<Harness showTurnProbe/>);
        const {submitPromise} = await startTurn('tell me about lighthouses');

        act(() => {
            streamControl.onChunk(contentFrame('Here ', '1754062831240-0'));
        });

        rerender(<Harness showTurnProbe={false}/>);

        act(() => {
            streamControl.onChunk(contentFrame('it is.', '1754062831250-0'));
        });

        rerender(<Harness showTurnProbe/>);

        expect(streamControl.signal.aborted).toBe(false);
        expect(latestTurn.loading).toBe(true);
        expect(latestTurn.streamActive).toBe(true);
        expect(lastHistoryEntry().text).toBe('Here it is.');
        expect(lastHistoryEntry().isStreaming).toBe(true);
        expect(latestShared.chatId).toBe('chat-1');
        expect(latestShared.streamingChatId).toBe('chat-1');

        await act(async () => {
            streamControl.onChunk(runFinishedFrame());
            streamControl.finish();
            await submitPromise;
        });

        expect(latestTurn.loading).toBe(false);
        expect(lastHistoryEntry().isStreaming).toBe(false);
        expect(latestShared.streamingChatId).toBeNull();
    });

    it('keeps a question that arrived while the chat screen was unmounted', async () => {
        const {rerender} = render(<Harness showTurnProbe/>);
        await startTurn('assign the ticket');

        rerender(<Harness showTurnProbe={false}/>);

        act(() => {
            streamControl.onChunk(elicitationFrame());
        });

        rerender(<Harness showTurnProbe/>);

        expect(latestTurn.activeElicitation?.elicitationId).toBe('elicitation-1');
        expect(latestTurn.elicitationValues).toEqual({assignee: ''});
    });

    it('lets go of the stream when another conversation is opened', async () => {
        render(<Harness showTurnProbe/>);
        await startTurn('tell me about lighthouses');

        expect(streamControl.signal.aborted).toBe(false);

        act(() => {
            latestShared.setChatId('chat-2');
        });

        expect(streamControl.signal.aborted).toBe(true);

        await act(async () => {});
    });

    it('lets go of the stream when a new chat is started from anywhere', async () => {
        const {rerender} = render(<Harness showTurnProbe/>);
        await startTurn('tell me about lighthouses');

        rerender(<Harness showTurnProbe={false}/>);

        act(() => {
            latestShared.setChatHistory([]);
            latestShared.setChatId(null);
        });

        expect(streamControl.signal.aborted).toBe(true);

        await act(async () => {});
    });

    it('closes an open question when another conversation is opened', async () => {
        render(<Harness showTurnProbe/>);
        await startTurn('assign the ticket');

        act(() => {
            streamControl.onChunk(elicitationFrame());
        });

        expect(latestTurn.activeElicitation).not.toBeNull();

        act(() => {
            latestShared.setChatId('chat-2');
        });

        await act(async () => {});

        expect(latestTurn.activeElicitation).toBeNull();
        expect(latestTurn.elicitationValues).toEqual({});
    });

    it('forgets the id a new chat adopted once its turn has ended', async () => {
        render(<Harness showTurnProbe/>);
        const {submitPromise} = await startTurn('tell me about lighthouses');

        expect(latestShared.adoptedChatIdRef.current).toBe('chat-1');

        await act(async () => {
            streamControl.onChunk(runFinishedFrame());
            streamControl.finish();
            await submitPromise;
        });

        expect(latestShared.adoptedChatIdRef.current).toBeNull();
    });

    it('plays a cued theme without holding up the stream, and stops it when another conversation is opened', async () => {
        const audioElement = {play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), src: '', loop: true};
        vi.stubGlobal('Audio', class {
            constructor() {
                return audioElement;
            }
        });

        render(<Harness showTurnProbe/>);
        await startTurn('/feud');

        act(() => {
            streamControl.onChunk(themeCueFrame());
            streamControl.onChunk(contentFrame('Survey says', '1754062831240-0'));
        });

        expect(lastHistoryEntry().text).toBe('Survey says');
        expect(lastHistoryEntry().metadata['solesonic/sound'].cueId).toBe('sound-cue-theme');

        await waitFor(() => expect(audioElement.play).toHaveBeenCalledOnce());
        expect(audioElement.src).toBe('blob:theme');

        act(() => {
            latestShared.setChatId('chat-2');
        });

        expect(audioElement.pause).toHaveBeenCalledOnce();
        expect(releaseSoundObjectUrl).toHaveBeenCalledWith(THEME_SOUND_ID);

        await act(async () => {});
        vi.unstubAllGlobals();
    });

    it('skips a cued theme that lands while the chat screen is not shown', async () => {
        const {rerender} = render(<Harness showTurnProbe/>);
        await startTurn('/feud');

        rerender(<Harness showTurnProbe={false}/>);

        act(() => {
            streamControl.onChunk({...themeCueFrame(), data: themeCueFrame().data.replace('sound-cue-theme', 'sound-cue-away')});
        });

        await act(async () => {});

        rerender(<Harness showTurnProbe/>);

        expect(acquireSoundObjectUrl).not.toHaveBeenCalled();
        expect(latestTurn.soundPlayer.blockedSound).toBeNull();
    });

    it('releases a turn that has not started yet', async () => {
        render(<Harness showTurnProbe/>);
        holdStreamOpen();

        act(() => {
            latestTurn.setInputValue('tell me about lighthouses');
        });

        act(() => {
            void latestTurn.handleSubmit({});
        });

        await waitFor(() => {
            expect(streamControl).not.toBeNull();
        });

        act(() => {
            latestTurn.releaseTurn();
        });

        expect(streamControl.signal.aborted).toBe(true);

        await act(async () => {});
    });
});
