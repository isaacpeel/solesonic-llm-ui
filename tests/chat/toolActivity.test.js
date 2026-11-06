import {describe, it, expect, vi} from 'vitest';
import {applyToolActivity, formatDuration, savedToolCalls, settledToolCalls, summarizeToolCalls} from '../../src/chat/activity/toolActivity.js';
import chatService from '../../src/service/ChatService.js';
import {EMPTY_TRANSCRIPT, applyFrame} from '../../src/sharedsessions/sharedSessionTranscript.js';

const start = {toolCallId: 't1', name: 'web_search', phase: 'start', arguments: '{"query":"denver"}'};
const end = {toolCallId: 't1', name: 'web_search', phase: 'end', arguments: '{"query":"denver"}', status: 'ok', durationMs: 1500};

describe('applyToolActivity', () => {
    it('adds a running call on start and settles it on end', () => {
        const started = applyToolActivity(undefined, start, 1000);
        expect(started).toEqual([{toolCallId: 't1', name: 'web_search', arguments: '{"query":"denver"}', status: 'running', startedAt: 1000, durationMs: null}]);

        const ended = applyToolActivity(started, end, 5000);
        expect(ended).toEqual([{toolCallId: 't1', name: 'web_search', arguments: '{"query":"denver"}', status: 'ok', startedAt: 1000, durationMs: 1500}]);
    });

    it('keeps an end that arrives before its start', () => {
        const ended = applyToolActivity([], {...end, status: 'error'}, 1000);
        const replayed = applyToolActivity(ended, start, 2000);

        expect(replayed[0].status).toBe('error');
        expect(replayed[0].durationMs).toBe(1500);
    });

    it('ignores anything that is not a tool activity', () => {
        const calls = [];

        expect(applyToolActivity(calls, null)).toBe(calls);
        expect(applyToolActivity(calls, {name: 'web_search', phase: 'start'})).toBe(calls);
        expect(applyToolActivity(calls, {...start, phase: 'other'})).toBe(calls);
    });

    it('summarizes and formats', () => {
        const calls = [
            {status: 'ok', durationMs: 1500},
            {status: 'error', durationMs: 500},
            {status: 'running', durationMs: null},
        ];

        expect(summarizeToolCalls(calls)).toEqual({total: 3, running: 1, failed: 1, totalMs: 2000});
        expect(formatDuration(250)).toBe('250ms');
        expect(formatDuration(21400)).toBe('21.4s');
        expect(formatDuration(125000)).toBe('2m 5s');
        expect(formatDuration(undefined)).toBe('');
    });
});

describe('tool activity frames', () => {
    const customFrame = (value) => ({event: 'CUSTOM', data: JSON.stringify({name: 'tool', value})});

    it('routes a private chat frame to the recorder', () => {
        const recordToolActivity = vi.fn();

        chatService.handleStreamChunk(customFrame(start), {recordToolActivity});

        expect(recordToolActivity).toHaveBeenCalledWith(start);
    });

    it('records tool calls on the running message of a shared chat', () => {
        const started = applyFrame({...EMPTY_TRANSCRIPT}, {
            event: 'RUN_STARTED',
            data: JSON.stringify({runId: 'run-1', input: {messages: [{id: 'm-1', name: 'Alex', content: 'find jobs'}]}}),
        }, 'user-alex');

        const withStart = applyFrame(started, customFrame(start), 'user-alex');
        const withEnd = applyFrame(withStart, customFrame(end), 'user-alex');
        const runMessage = withEnd.messages.find((message) => message._key === 'run-run-1');

        expect(runMessage.toolCalls).toHaveLength(1);
        expect(runMessage.toolCalls[0]).toMatchObject({name: 'web_search', status: 'ok', durationMs: 1500});
    });
});

describe('saved tool logs', () => {
    const saved = [{toolCallId: 't1', name: 'web_search', arguments: '{"query":"denver"}', status: 'ok', durationMs: 1500}];

    it('reads a saved log into the shape the activity box shows', () => {
        expect(savedToolCalls(saved)).toEqual([{toolCallId: 't1', name: 'web_search', arguments: '{"query":"denver"}', status: 'ok', startedAt: null, durationMs: 1500}]);
        expect(savedToolCalls([])).toBeUndefined();
        expect(savedToolCalls(null)).toBeUndefined();
        expect(savedToolCalls([{name: 'no id'}])).toBeUndefined();
    });

    it('prefers the live log and falls back to the saved one', () => {
        const live = [{toolCallId: 'live', name: 'jira_search', status: 'ok', startedAt: 1, durationMs: 2}];

        expect(settledToolCalls(live, saved)).toBe(live);
        expect(settledToolCalls([], saved)[0].toolCallId).toBe('t1');
    });

    it('takes the saved log from the finished frame of a shared chat that missed the live frames', () => {
        const started = applyFrame({...EMPTY_TRANSCRIPT}, {
            event: 'RUN_STARTED',
            data: JSON.stringify({runId: 'run-1', input: {messages: [{id: 'm-1', name: 'Alex', content: 'find jobs'}]}}),
        }, 'user-alex');

        const finished = applyFrame(started, {
            event: 'RUN_FINISHED',
            data: JSON.stringify({result: {message: {messageType: 'ASSISTANT', message: 'Here you go', toolCalls: saved}}}),
        }, 'user-alex');

        const answer = finished.messages.find((message) => message.text === 'Here you go');
        expect(answer.toolCalls[0]).toMatchObject({name: 'web_search', status: 'ok', durationMs: 1500});
    });
});
