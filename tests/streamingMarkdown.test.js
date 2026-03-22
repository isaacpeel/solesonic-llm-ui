import { describe, it, expect } from 'vitest';
import { buildStreamingMarkdownDisplay } from '../src/utils/streamingMarkdown.js';

describe('buildStreamingMarkdownDisplay - streaming repairs', () => {
    it('closes unbalanced code fences during streaming', () => {
        const raw = 'Here is code:\n```js\nconst x = 1;';
        const display = buildStreamingMarkdownDisplay(raw, { isFinal: false });

        expect(display.endsWith('```')).toBe(true);
        // Ensure a newline precedes the synthetic fence for safety
        expect(display.includes('\n```')).toBe(true);
    });

    it('does not add synthetic closers for final messages', () => {
        const raw = 'Here is code:\n```js\nconst x = 1;\n```';
        const display = buildStreamingMarkdownDisplay(raw, { isFinal: true });
        expect(display).toBe(raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n'));
    });

    it('closes unbalanced inline code backtick', () => {
        const raw = 'Inline `code';
        const display = buildStreamingMarkdownDisplay(raw, { isFinal: false });
        expect(display).toBe('Inline `code`');
    });

    it('closes unbalanced link parenthesis', () => {
        const raw = 'Check this [link](https://example.com';
        const display = buildStreamingMarkdownDisplay(raw, { isFinal: false });
        expect(display).toBe('Check this [link](https://example.com)');
    });

    it('adds NBSP to bare list markers so they render', () => {
        const raw = '-\n*\n1.';
        const display = buildStreamingMarkdownDisplay(raw, { isFinal: false });
        expect(display).toBe('- \u00A0\n* \u00A0\n1. \u00A0');
    });
});

describe('buildStreamingMarkdownDisplay - normalization', () => {
    it('normalizes CRLF to LF and collapses 3+ newlines to 2', () => {
        const raw = 'a\r\n\r\n\r\n\r\nb';
        const display = buildStreamingMarkdownDisplay(raw, { isFinal: true });
        expect(display).toBe('a\n\nb');
    });

    it('collapses interior multi-space runs outside code/inline code during streaming', () => {
        const raw = 'Hello   world   here';
        const display = buildStreamingMarkdownDisplay(raw, { isFinal: false });
        expect(display).toBe('Hello world here');
    });

    it('preserves up to two trailing spaces for markdown hard line break during streaming', () => {
        const raw = 'Line with hard break  ';
        const display = buildStreamingMarkdownDisplay(raw, { isFinal: false });
        expect(display.endsWith('  ')).toBe(true);
    });

    it('does not alter spaces inside inline code during streaming', () => {
        const raw = 'Use `inline   code` here';
        const display = buildStreamingMarkdownDisplay(raw, { isFinal: false });
        expect(display).toBe('Use `inline   code` here');
    });
});
