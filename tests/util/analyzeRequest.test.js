import {describe, it, expect} from 'vitest';
import {
    buildAnalyzeRequest,
    canAnalyze,
    commandsOfLastUserMessage,
    isAnalyzableCode,
} from '../../src/util/analyzeRequest.js';

describe('analyzeRequest', () => {
    it('only failures the logs can explain are analyzable', () => {
        for (const code of ['internal', 'timeout', 'UPSTREAM_UNAVAILABLE', 'RATE_LIMITED', 'TOOL_FAILURE',
            'STREAM_UNAVAILABLE', 'CONTEXT_LENGTH_EXCEEDED']) {
            expect(isAnalyzableCode(code)).toBe(true);
        }
        for (const code of ['VALIDATION', 'LLM_KEY_MISSING', 'RECONNECT_REQUIRED', 'GENERATION_TIMEOUT', undefined, null]) {
            expect(isAnalyzableCode(code)).toBe(false);
        }
    });

    it('a failed /logs turn is never offered for analysis', () => {
        expect(canAnalyze({analyzable: true, failedCommands: ['agile']})).toBe(true);
        expect(canAnalyze({analyzable: true, failedCommands: ['logs']})).toBe(false);
        expect(canAnalyze({analyzable: false})).toBe(false);
        expect(canAnalyze(null)).toBe(false);
    });

    it('finds the commands of the most recent user message', () => {
        const history = [{type: 'USER', commands: ['agile']}, {type: 'ASSISTANT'}, {type: 'USER'}, {type: 'ASSISTANT'}];
        expect(commandsOfLastUserMessage(history, 'USER')).toEqual([]);
        expect(commandsOfLastUserMessage(history.slice(0, 2), 'USER')).toEqual(['agile']);
        expect(commandsOfLastUserMessage([], 'USER')).toEqual([]);
    });

    it('builds the request from the error time, text and code', () => {
        expect(buildAnalyzeRequest({
            text: 'An unexpected error occurred. Please try again.', code: 'internal',
            occurredAt: '2026-11-05T17:27:20.138Z', timestamp: '2026-11-05T17:27:21.000Z',
        })).toBe('Analyze the error shown in this chat at 2026-11-05T17:27:20Z: "An unexpected error occurred. '
            + 'Please try again." (code internal). Explain what happened and whether I should try again.');
    });

    it('falls back to the message time, and caps and flattens the quoted text', () => {
        const request = buildAnalyzeRequest({text: `line one\n${'x'.repeat(400)}`, timestamp: '2026-11-05T17:27:21+00:00'});
        expect(request).toContain('at 2026-11-05T17:27:21Z: "line one xxx');
        expect(request).toContain('…"');
        expect(request).not.toContain('(code');
        expect(request).not.toContain('\n');
    });
});
