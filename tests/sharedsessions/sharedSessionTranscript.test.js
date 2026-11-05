import {describe, it, expect} from 'vitest';
import {
    EMPTY_TRANSCRIPT,
    applyFrame,
    isPromptForViewer,
    isViewersTurn,
    otherParticipantNames,
    transcriptFromMessages,
    waitingOn,
} from '../../src/sharedsessions/sharedSessionTranscript.js';

const ALEX = 'user-alex';
const SAM = 'user-sam';
const RILEY = 'user-riley';

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

const frame = (event, data, id) => ({event, data: JSON.stringify(data), id});

const runStarted = (runId, messageId, content, name) => frame('RUN_STARTED', {
    runId,
    input: {messages: [{id: messageId, content, name}]},
});

describe('sharedSessionTranscript', () => {
    it('names each message by its participant and marks the viewer’s own', () => {
        const transcript = transcriptFromMessages([
            {id: 'm1', messageType: 'USER', message: 'new show', senderUserId: SAM},
            {id: 'm2', messageType: 'ASSISTANT', message: 'Welcome!'},
            {id: 'm3', messageType: 'USER', message: 'towel', senderUserId: ALEX},
            {id: 'm4', messageType: 'SYSTEM', message: 'Surveying…', progressData: {message: 'Surveying…'}},
        ], SESSION, ALEX);

        expect(transcript.session).toBe(SESSION);
        expect(transcript.messages.map((message) => [message.text, message.senderName, message.mine])).toEqual([
            ['new show', 'Sam', false],
            ['Welcome!', null, false],
            ['towel', 'Alex', true],
        ]);
    });

    it('shows another participant’s message when their run starts, then streams the reply into it', () => {
        let state = {...EMPTY_TRANSCRIPT, session: SESSION};

        state = applyFrame(state, runStarted('run-1', 'm9', 'sunscreen', 'Sam'), ALEX);
        state = applyFrame(state, frame('TEXT_MESSAGE_CONTENT', {delta: 'Survey '}), ALEX);
        state = applyFrame(state, frame('TEXT_MESSAGE_CONTENT', {delta: 'says…'}), ALEX);

        expect(state.activeRun).toEqual({runId: 'run-1'});
        expect(state.messages[0]).toMatchObject({type: 'USER', text: 'sunscreen', senderName: 'Sam', mine: false});
        expect(state.messages[1]).toMatchObject({type: 'ASSISTANT', text: 'Survey says…', isStreaming: true});
    });

    it('marks the viewer’s own message from the stream as theirs, by the name the session gives them', () => {
        const state = applyFrame({...EMPTY_TRANSCRIPT, session: SESSION}, runStarted('run-1', 'm9', 'towel', 'Alex'), ALEX);

        expect(state.messages[0].mine).toBe(true);
    });

    it('marks nothing as the viewer’s own before the session is known', () => {
        const state = applyFrame(EMPTY_TRANSCRIPT, runStarted('run-1', 'm9', 'towel', 'Alex'), ALEX);

        expect(state.messages[0].mine).toBe(false);
    });

    it('does not repeat a message already in the transcript', () => {
        const loaded = transcriptFromMessages([{id: 'm9', messageType: 'USER', message: 'towel', senderUserId: ALEX}], SESSION, ALEX);

        const state = applyFrame(loaded, runStarted('run-1', 'm9', 'towel', 'Alex'), ALEX);

        expect(state.messages.filter((message) => message.type === 'USER')).toHaveLength(1);
    });

    it('takes the session state the run reports and finishes the reply', () => {
        let state = applyFrame({...EMPTY_TRANSCRIPT, session: SESSION}, runStarted('run-1', 'm9', 'towel', 'Alex'), ALEX);
        const nextSession = {...SESSION, turn: {userIds: [ALEX], next: 'choice', over: false}};

        state = applyFrame(state, frame('CUSTOM', {name: 'session_state', value: nextSession}), ALEX);
        state = applyFrame(state, frame('RUN_FINISHED', {result: {message: {messageType: 'ASSISTANT', message: 'Top answer!'}}}), ALEX);

        expect(state.session).toEqual(nextSession);
        expect(state.activeRun).toBeNull();
        expect(state.messages[1]).toMatchObject({text: 'Top answer!', isStreaming: false});
    });

    it('drops an empty reply and shows a failed run as an error', () => {
        let state = applyFrame({...EMPTY_TRANSCRIPT, session: SESSION}, runStarted('run-1', 'm9', 'towel', 'Alex'), ALEX);
        state = applyFrame(state, frame('RUN_FINISHED', {result: {message: {messageType: 'ASSISTANT', message: ''}}}), ALEX);

        expect(state.messages.map((message) => message.type)).toEqual(['USER']);

        state = applyFrame(state, runStarted('run-2', 'm10', 'chair', 'Alex'), ALEX);
        state = applyFrame(state, frame('RUN_ERROR', {message: 'The agent is busy.'}), ALEX);

        expect(state.messages.at(-1)).toMatchObject({type: 'ERROR', text: 'The agent is busy.'});
        expect(state.activeRun).toBeNull();
    });

    it('ignores frames it cannot read', () => {
        const state = {...EMPTY_TRANSCRIPT, session: SESSION};

        expect(applyFrame(state, {event: 'TEXT_MESSAGE_CONTENT', data: 'not json'}, ALEX)).toBe(state);
        expect(applyFrame(state, frame('RUN_STARTED', {}), ALEX)).toBe(state);
    });

    it('says who the session is waiting on', () => {
        expect(isViewersTurn(SESSION, SAM)).toBe(true);
        expect(isViewersTurn(SESSION, ALEX)).toBe(false);
        expect(isViewersTurn({...SESSION, status: 'COMPLETED'}, SAM)).toBe(false);
        expect(waitingOn(SESSION, ALEX)).toEqual(['Sam']);
        expect(waitingOn(SESSION, SAM)).toEqual([]);
    });

    it('names every other participant, not just one', () => {
        const threeWay = {...SESSION, participants: [...SESSION.participants, {userId: RILEY, username: 'riley'}]};

        expect(otherParticipantNames(threeWay, ALEX)).toEqual(['Sam', 'riley']);
        expect(otherParticipantNames(null, ALEX)).toEqual([]);
    });

    it('shows a question only to the participant it is for', () => {
        const asking = {...SESSION, prompt: {elicitationId: 'q1', forUserIds: [ALEX]}};

        expect(isPromptForViewer(asking, ALEX)).toBe(true);
        expect(isPromptForViewer(asking, SAM)).toBe(false);
        expect(isPromptForViewer(SESSION, ALEX)).toBe(false);
    });

    it('carries generated images, response metadata and the time through from stored messages', () => {
        const transcript = transcriptFromMessages([
            {
                id: 'a1',
                messageType: 'ASSISTANT',
                message: 'Here you go',
                timestamp: '2026-11-05T12:00:00Z',
                responseMetadata: {model: 'm'},
                responseMetadataCalls: 2,
                generatedImages: [{imageId: 'img-1', prompt: 'a cat'}],
            },
        ], SESSION, ALEX);

        expect(transcript.messages[0]).toMatchObject({
            timestamp: '2026-11-05T12:00:00Z',
            responseMetadata: {model: 'm'},
            responseMetadataCalls: 2,
        });
        expect(transcript.messages[0].generatedImages).toHaveLength(1);
        expect(transcript.messages[0].generatedImages[0]).toMatchObject({imageId: 'img-1', prompt: 'a cat'});
    });

    it('hangs stored tool progress on the reply that follows it', () => {
        const transcript = transcriptFromMessages([
            {id: 'p1', messageType: 'SYSTEM', message: 'Searching the web', progressData: {message: 'Searching the web'}},
            {id: 'a1', messageType: 'ASSISTANT', message: 'Found it'},
        ], SESSION, ALEX);

        expect(transcript.messages).toHaveLength(1);
        expect(transcript.messages[0].notifications).toEqual(['Searching the web']);
    });

    it('streams a generated image into the reply, once', () => {
        let state = {...EMPTY_TRANSCRIPT, session: SESSION};
        const imageFrame = frame('CUSTOM', {name: 'image', value: {imageId: 'img-1', prompt: 'a cat'}});

        state = applyFrame(state, runStarted('run-1', 'm9', 'draw a cat', 'Sam'), ALEX);
        state = applyFrame(state, imageFrame, ALEX);
        state = applyFrame(state, imageFrame, ALEX);

        const reply = state.messages.find((message) => message._key === 'run-run-1');
        expect(reply.generatedImages.map((image) => image.imageId)).toEqual(['img-1']);
    });

    it('merges start-of-message metadata into the reply', () => {
        let state = {...EMPTY_TRANSCRIPT, session: SESSION};

        state = applyFrame(state, runStarted('run-1', 'm9', 'hi', 'Sam'), ALEX);
        state = applyFrame(state, frame('TEXT_MESSAGE_START', {metadata: {a: 1}}), ALEX);
        state = applyFrame(state, frame('TEXT_MESSAGE_START', {metadata: {b: 2}}), ALEX);

        expect(state.messages.find((message) => message._key === 'run-run-1').metadata).toEqual({a: 1, b: 2});
    });

    it('shows tool progress with its percentage and collapses repeats of one step', () => {
        let state = {...EMPTY_TRANSCRIPT, session: SESSION};
        const progress = (value) => frame('CUSTOM', {name: 'progress', value});

        state = applyFrame(state, runStarted('run-1', 'm9', 'hi', 'Sam'), ALEX);
        state = applyFrame(state, progress({message: 'Generating image', progress: 10, total: 100}), ALEX);
        state = applyFrame(state, progress({message: 'Generating image', progress: 60, total: 100}), ALEX);
        state = applyFrame(state, progress({message: 'Searching the web'}), ALEX);

        expect(state.messages.find((message) => message._key === 'run-run-1').notifications)
            .toEqual(['Generating image 60%', 'Searching the web']);
    });

    it('takes images, metadata and the time from the finished run', () => {
        let state = {...EMPTY_TRANSCRIPT, session: SESSION};

        state = applyFrame(state, runStarted('run-1', 'm9', 'draw', 'Sam'), ALEX);
        state = applyFrame(state, frame('RUN_FINISHED', {
            result: {message: {
                messageType: 'ASSISTANT',
                message: 'Done',
                timestamp: '2026-11-05T12:00:00Z',
                responseMetadata: {model: 'm'},
                generatedImages: [{imageId: 'img-2'}],
            }},
        }), ALEX);

        const reply = state.messages.find((message) => message._key === 'run-run-1');
        expect(reply).toMatchObject({text: 'Done', isStreaming: false, timestamp: '2026-11-05T12:00:00Z', responseMetadata: {model: 'm'}});
        expect(reply.generatedImages.map((image) => image.imageId)).toEqual(['img-2']);
    });

    it('does not hang progress from before a user message on the reply after it', () => {
        const transcript = transcriptFromMessages([
            {id: 'p1', messageType: 'SYSTEM', message: 'Searching', progressData: {message: 'Searching'}},
            {id: 'u1', messageType: 'USER', message: 'next', senderUserId: SAM},
            {id: 'a1', messageType: 'ASSISTANT', message: 'Reply'},
        ], SESSION, ALEX);

        expect(transcript.messages[1].notifications).toBeUndefined();
    });

    it('carries the attachments and commands of stored rows, for the sender and for everyone else', () => {
        const attachment = {id: 'att-1', fileName: 'chart.png', contentType: 'image/png', description: 'a chart'};
        const transcript = transcriptFromMessages([
            {id: 'u1', messageType: 'USER', message: 'look', senderUserId: SAM, attachments: [attachment], commands: ['web_search']},
            {id: 'u2', messageType: 'USER', message: 'plain', senderUserId: ALEX},
        ], SESSION, ALEX);

        expect(transcript.messages[0].attachments).toEqual([attachment]);
        expect(transcript.messages[0].commands).toEqual(['web_search']);
        expect(transcript.messages[0].mine).toBe(false);
        expect(transcript.messages[1].attachments).toEqual([]);
        expect(transcript.messages[1].commands).toEqual([]);
    });

    it('carries the attachments of the run echo', () => {
        const attachment = {id: 'att-2', fileName: 'notes.pdf', contentType: 'application/pdf'};
        const state = applyFrame({...EMPTY_TRANSCRIPT, session: SESSION}, frame('RUN_STARTED', {
            runId: 'run-7',
            input: {messages: [{id: 'm7', content: 'see attached', name: 'Sam', attachments: [attachment], commands: ['generate_image']}]},
        }), ALEX);

        const echoed = state.messages.find((message) => message.messageId === 'm7');
        expect(echoed.attachments).toEqual([attachment]);
        expect(echoed.commands).toEqual(['generate_image']);
    });

    it('treats an echo without attachments as having none', () => {
        const state = applyFrame({...EMPTY_TRANSCRIPT, session: SESSION}, runStarted('run-8', 'm8', 'hi', 'Sam'), ALEX);

        expect(state.messages.find((message) => message.messageId === 'm8').attachments).toEqual([]);
    });

    it('marks an echo as the viewer\'s own by sender id when the echo carries one', () => {
        const echo = (extra) => frame('RUN_STARTED', {
            runId: 'run-9',
            input: {messages: [{id: 'm9', content: 'hi', name: 'Someone Else', ...extra}]},
        });

        const mine = applyFrame({...EMPTY_TRANSCRIPT, session: SESSION}, echo({senderUserId: ALEX}), ALEX);
        const theirs = applyFrame({...EMPTY_TRANSCRIPT, session: SESSION}, echo({senderUserId: SAM, name: 'Alex'}), ALEX);

        expect(mine.messages.find((message) => message.messageId === 'm9').mine).toBe(true);
        expect(theirs.messages.find((message) => message.messageId === 'm9').mine).toBe(false);
    });

    it('falls back to the seat of the named participant, and is not mine for an unseated name', () => {
        const echoFrom = (name) => frame('RUN_STARTED', {runId: 'run-9', input: {messages: [{id: 'm9', content: 'hi', name}]}});

        const fromAlex = applyFrame({...EMPTY_TRANSCRIPT, session: SESSION}, echoFrom('Alex'), ALEX);
        const fromSam = applyFrame({...EMPTY_TRANSCRIPT, session: SESSION}, echoFrom('Sam'), ALEX);
        const fromStranger = applyFrame({...EMPTY_TRANSCRIPT, session: SESSION}, echoFrom('Zed'), ALEX);

        expect(fromAlex.messages[0].mine).toBe(true);
        expect(fromSam.messages[0].mine).toBe(false);
        expect(fromStranger.messages[0].mine).toBe(false);
    });
});
