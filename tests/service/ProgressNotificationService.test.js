import {describe, it, expect} from 'vitest';
import {getProgressNotificationTextFromRawData} from '../../src/service/ProgressNotificationService.js';

describe('getProgressNotificationTextFromRawData', () => {
    describe('invalid input', () => {
        it('returns null for null', () => {
            expect(getProgressNotificationTextFromRawData(null)).toBeNull();
        });

        it('returns null for undefined', () => {
            expect(getProgressNotificationTextFromRawData(undefined)).toBeNull();
        });

        it('returns null for a number', () => {
            expect(getProgressNotificationTextFromRawData(42)).toBeNull();
        });

        it('returns null for an object', () => {
            expect(getProgressNotificationTextFromRawData({})).toBeNull();
        });

        it('returns null for an empty string', () => {
            expect(getProgressNotificationTextFromRawData('')).toBeNull();
        });

        it('returns null for invalid JSON', () => {
            expect(getProgressNotificationTextFromRawData('not-json')).toBeNull();
        });

        it('returns null for malformed JSON', () => {
            expect(getProgressNotificationTextFromRawData('{bad:')).toBeNull();
        });
    });

    describe('missing required fields', () => {
        it('returns null when progressToken is absent', () => {
            const payload = JSON.stringify({message: 'Step 1', progress: 1, total: 5});
            expect(getProgressNotificationTextFromRawData(payload)).toBeNull();
        });

        it('returns null when progressToken is present but none of message/progress/total are present', () => {
            const payload = JSON.stringify({progressToken: 'tok'});
            expect(getProgressNotificationTextFromRawData(payload)).toBeNull();
        });

        it('returns null for a plain non-object JSON value', () => {
            expect(getProgressNotificationTextFromRawData('"just a string"')).toBeNull();
            expect(getProgressNotificationTextFromRawData('42')).toBeNull();
        });
    });

    describe('valid progress notifications', () => {
        it('returns the trimmed message when all fields are present', () => {
            const payload = JSON.stringify({progressToken: 'tok', message: '  Step 1  ', progress: 1, total: 5});
            expect(getProgressNotificationTextFromRawData(payload)).toBe('Step 1');
        });

        it('returns the message when only progressToken and message are present', () => {
            const payload = JSON.stringify({progressToken: 'tok', message: 'Loading data'});
            expect(getProgressNotificationTextFromRawData(payload)).toBe('Loading data');
        });

        it('detects a valid notification via progress field when message is absent', () => {
            const payload = JSON.stringify({progressToken: 'tok', progress: 2, total: 5});
            expect(getProgressNotificationTextFromRawData(payload)).toBeUndefined();
        });

        it('detects a valid notification via total field alone', () => {
            const payload = JSON.stringify({progressToken: 'tok', total: 10});
            expect(getProgressNotificationTextFromRawData(payload)).toBeUndefined();
        });

        it('returns undefined when progressToken is present but message is whitespace only', () => {
            const payload = JSON.stringify({progressToken: 'tok', message: '   '});
            expect(getProgressNotificationTextFromRawData(payload)).toBeUndefined();
        });

        it('returns undefined when progressToken is present but message is empty string', () => {
            const payload = JSON.stringify({progressToken: 'tok', message: ''});
            expect(getProgressNotificationTextFromRawData(payload)).toBeUndefined();
        });

        it('handles numeric progress value as string', () => {
            const payload = JSON.stringify({progressToken: 'tok', progress: '3', total: '10', message: 'Step 3'});
            expect(getProgressNotificationTextFromRawData(payload)).toBe('Step 3');
        });
    });
});
