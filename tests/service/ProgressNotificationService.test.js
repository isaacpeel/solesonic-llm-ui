import {describe, it, expect} from 'vitest';
import {
    appendProgressNotificationText,
    formatProgressNotificationText,
    getProgressNotificationText,
} from '../../src/service/ProgressNotificationService.js';

describe('getProgressNotificationText', () => {
    describe('invalid input', () => {
        it('returns null for null', () => {
            expect(getProgressNotificationText(null)).toBeNull();
        });

        it('returns null for undefined', () => {
            expect(getProgressNotificationText(undefined)).toBeNull();
        });

        it('returns null for a number', () => {
            expect(getProgressNotificationText(42)).toBeNull();
        });

        it('returns null for a string', () => {
            expect(getProgressNotificationText('Step 1')).toBeNull();
        });

        it('returns null for an empty object', () => {
            expect(getProgressNotificationText({})).toBeNull();
        });
    });

    describe('missing required fields', () => {
        it('returns null when progressToken is absent', () => {
            expect(getProgressNotificationText({message: 'Step 1', progress: 1, total: 5})).toBeNull();
        });

        it('returns null when progressToken is present but none of message/progress/total are present', () => {
            expect(getProgressNotificationText({progressToken: 'tok'})).toBeNull();
        });
    });

    describe('valid progress notifications', () => {
        it('returns the trimmed message with its percentage when all fields are present', () => {
            expect(getProgressNotificationText({progressToken: 'tok', message: '  Step 1  ', progress: 1, total: 5}))
                .toBe('Step 1 20%');
        });

        it('returns the message when only progressToken and message are present', () => {
            expect(getProgressNotificationText({progressToken: 'tok', message: 'Loading data'})).toBe('Loading data');
        });

        it('returns a bare percentage when message is absent', () => {
            expect(getProgressNotificationText({progressToken: 'tok', progress: 2, total: 5})).toBe('40%');
        });

        it('returns null for a total with no progress to measure against it', () => {
            expect(getProgressNotificationText({progressToken: 'tok', total: 10})).toBeNull();
        });

        it('returns null when progressToken is present but message is whitespace only', () => {
            expect(getProgressNotificationText({progressToken: 'tok', message: '   '})).toBeNull();
        });

        it('returns null when progressToken is present but message is empty string', () => {
            expect(getProgressNotificationText({progressToken: 'tok', message: ''})).toBeNull();
        });

        it('handles numeric progress and total sent as strings', () => {
            expect(getProgressNotificationText({progressToken: 'tok', progress: '3', total: '10', message: 'Step 3'}))
                .toBe('Step 3 30%');
        });

        /* The shape the image generation backend actually emits. */
        it('renders a generation frame as message plus percentage', () => {
            expect(getProgressNotificationText({
                progressToken: '9a19a1de-887e-4e5e-b360-135754253499',
                message: 'Generating…',
                progress: '16.0',
                total: '100.0',
                chatId: '9a19a1de-887e-4e5e-b360-135754253499',
            })).toBe('Generating… 16%');
        });

        it('renders a percentage from a notifications/progress wrapped frame', () => {
            expect(getProgressNotificationText({
                method: 'notifications/progress',
                params: {progressToken: 'tok', message: 'Generating…', progress: '50.0', total: '100.0'},
            })).toBe('Generating… 50%');
        });
    });

    /*
     * The vision pass emits progress frames keyed by attachment id with null progress/total.
     * These lock in that the detector recognises that shape unchanged.
     */
    describe('vision attachment progress frames', () => {
        it('recognises a vision frame with null progress and total', () => {
            expect(getProgressNotificationText({
                progressToken: 'a3f1c8e2-4b7d-4c9a-9f2e-1d8b6a5c3e7f',
                message: 'Reading attached image screenshot.png',
                progress: null,
                total: null,
            })).toBe('Reading attached image screenshot.png');
        });

        it('recognises a vision frame wrapped in notifications/progress', () => {
            expect(getProgressNotificationText({
                method: 'notifications/progress',
                params: {
                    progressToken: 'a3f1c8e2-4b7d-4c9a-9f2e-1d8b6a5c3e7f',
                    message: 'Reading attached image diagram.png',
                    progress: null,
                    total: null,
                },
            })).toBe('Reading attached image diagram.png');
        });

        it('trims surrounding whitespace from a vision frame message', () => {
            expect(getProgressNotificationText({
                progressToken: 'attachment-1',
                message: '  Reading attached image a.png  ',
                progress: null,
                total: null,
            })).toBe('Reading attached image a.png');
        });
    });
});

describe('formatProgressNotificationText', () => {
    it('returns null for a non-object', () => {
        expect(formatProgressNotificationText(null)).toBeNull();
        expect(formatProgressNotificationText('Generating…')).toBeNull();
    });

    it('rounds a fractional percentage to a whole number', () => {
        expect(formatProgressNotificationText({message: 'Generating…', progress: 1, total: 3})).toBe('Generating… 33%');
    });

    it('renders zero progress as 0%', () => {
        expect(formatProgressNotificationText({
            message: 'Generating…',
            progress: 0,
            total: 100
        })).toBe('Generating… 0%');
    });

    it('renders a completed step as 100%', () => {
        expect(formatProgressNotificationText({message: 'Generating…', progress: '100.0', total: '100.0'}))
            .toBe('Generating… 100%');
    });

    it('clamps a percentage above 100', () => {
        expect(formatProgressNotificationText({message: 'Generating…', progress: 120, total: 100}))
            .toBe('Generating… 100%');
    });

    it('clamps a negative percentage to 0', () => {
        expect(formatProgressNotificationText({message: 'Generating…', progress: -5, total: 100}))
            .toBe('Generating… 0%');
    });

    it('omits the percentage when total is zero', () => {
        expect(formatProgressNotificationText({message: 'Generating…', progress: 3, total: 0})).toBe('Generating…');
    });

    it('omits the percentage when total is absent — a bare count has no scale', () => {
        expect(formatProgressNotificationText({message: 'Step 3', progress: 3})).toBe('Step 3');
    });

    it('omits the percentage when either value is unparseable', () => {
        expect(formatProgressNotificationText({message: 'Generating…', progress: 'soon', total: '100.0'}))
            .toBe('Generating…');
    });
});

describe('appendProgressNotificationText', () => {
    it('appends the first step to an empty log', () => {
        expect(appendProgressNotificationText([], 'Generating… 4%')).toEqual(['Generating… 4%']);
    });

    it('tolerates a missing notifications array', () => {
        expect(appendProgressNotificationText(undefined, 'Generating… 4%')).toEqual(['Generating… 4%']);
    });

    it('returns the log untouched for empty text', () => {
        const notifications = ['Generating… 4%'];
        expect(appendProgressNotificationText(notifications, '')).toBe(notifications);
    });

    it('replaces the previous frame of the same step rather than stacking', () => {
        const notifications = ['Reading attached image a.png', 'Generating… 4%'];

        expect(appendProgressNotificationText(notifications, 'Generating… 87%'))
            .toEqual(['Reading attached image a.png', 'Generating… 87%']);
    });

    it('collapses a percentage onto the percentage-less first frame of the same step', () => {
        expect(appendProgressNotificationText(['Generating…'], 'Generating… 4%')).toEqual(['Generating… 4%']);
    });

    it('appends when the step label changes', () => {
        expect(appendProgressNotificationText(['Generating… 100%'], 'Uploading… 4%'))
            .toEqual(['Generating… 100%', 'Uploading… 4%']);
    });

    it('appends distinct steps that carry no percentage at all', () => {
        expect(appendProgressNotificationText(['Reading attached image a.png'], 'Reading attached image b.png'))
            .toEqual(['Reading attached image a.png', 'Reading attached image b.png']);
    });

    it('does not mutate the array it is given', () => {
        const notifications = ['Generating… 4%'];
        appendProgressNotificationText(notifications, 'Generating… 9%');

        expect(notifications).toEqual(['Generating… 4%']);
    });
});
