import {describe, it, expect} from 'vitest';
import {formatRelativeTime} from '../../src/util/relativeTime.js';

const NOW = new Date('2026-08-04T12:00:00.000Z').getTime();

function agoBy(milliseconds) {
    return new Date(NOW - milliseconds);
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
    it('reports anything under a minute as "just now"', () => {
        expect(formatRelativeTime(agoBy(0), NOW)).toBe('just now');
        expect(formatRelativeTime(agoBy(30 * SECOND), NOW)).toBe('just now');
        expect(formatRelativeTime(agoBy(MINUTE - 1), NOW)).toBe('just now');
    });

    it('counts minutes up to the hour', () => {
        expect(formatRelativeTime(agoBy(MINUTE), NOW)).toBe('1 minute ago');
        expect(formatRelativeTime(agoBy(5 * MINUTE), NOW)).toBe('5 minutes ago');
        expect(formatRelativeTime(agoBy(59 * MINUTE), NOW)).toBe('59 minutes ago');
    });

    it('counts hours up to the day', () => {
        expect(formatRelativeTime(agoBy(HOUR), NOW)).toBe('1 hour ago');
        expect(formatRelativeTime(agoBy(23 * HOUR), NOW)).toBe('23 hours ago');
    });

    it('counts days up to the week', () => {
        expect(formatRelativeTime(agoBy(DAY), NOW)).toBe('1 day ago');
        expect(formatRelativeTime(agoBy(2 * DAY), NOW)).toBe('2 days ago');
        expect(formatRelativeTime(agoBy(6 * DAY), NOW)).toBe('6 days ago');
    });

    it('steps up through weeks, months and years', () => {
        expect(formatRelativeTime(agoBy(7 * DAY), NOW)).toBe('1 week ago');
        expect(formatRelativeTime(agoBy(21 * DAY), NOW)).toBe('3 weeks ago');
        expect(formatRelativeTime(agoBy(60 * DAY), NOW)).toBe('2 months ago');
        expect(formatRelativeTime(agoBy(400 * DAY), NOW)).toBe('1 year ago');
    });

    /* Server stamps the message, browser reads the clock; a few seconds of skew is normal. */
    it('does not render a future timestamp as "in x seconds"', () => {
        expect(formatRelativeTime(new Date(NOW + 4 * SECOND), NOW)).toBe('just now');
    });

    it('returns null for anything that is not a usable date', () => {
        expect(formatRelativeTime(null, NOW)).toBeNull();
        expect(formatRelativeTime(new Date('nonsense'), NOW)).toBeNull();
        expect(formatRelativeTime('2026-08-04T12:00:00Z', NOW)).toBeNull();
    });
});
