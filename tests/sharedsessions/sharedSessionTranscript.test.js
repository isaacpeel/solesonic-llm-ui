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
});
