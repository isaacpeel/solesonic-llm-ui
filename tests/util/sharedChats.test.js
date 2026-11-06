import {describe, it, expect} from 'vitest';
import {
    MAXIMUM_SHOWN_PARTICIPANTS,
    initialsOf,
    isSharedChat,
    isSharedChatOwner,
    participantLabel,
    participantSummary,
} from '../../src/util/sharedChats.js';

describe('isSharedChat', () => {
    it('needs both the kind and a session to open', () => {
        expect(isSharedChat({kind: 'SHARED', sharedSessionId: 's1'})).toBe(true);
        expect(isSharedChat({kind: 'SHARED'})).toBe(false);
        expect(isSharedChat({kind: 'CONVERSATION', sharedSessionId: 's1'})).toBe(false);
        expect(isSharedChat({})).toBe(false);
        expect(isSharedChat(null)).toBe(false);
    });
});

describe('isSharedChatOwner', () => {
    it('compares the owner with the viewer', () => {
        expect(isSharedChatOwner({ownerUserId: 'a'}, 'a')).toBe(true);
        expect(isSharedChatOwner({ownerUserId: 'a'}, 'b')).toBe(false);
        expect(isSharedChatOwner({ownerUserId: 'a'}, null)).toBe(false);
        expect(isSharedChatOwner({}, undefined)).toBe(false);
    });
});

describe('initialsOf', () => {
    it('takes the first letters of the first two words, upper case', () => {
        expect(initialsOf('Isaac Peel')).toBe('IP');
        expect(initialsOf('sam')).toBe('S');
        expect(initialsOf('  mary jane watson ')).toBe('MJ');
    });

    it('copes with names that are empty or missing', () => {
        expect(initialsOf('')).toBe('?');
        expect(initialsOf(null)).toBe('?');
        expect(initialsOf(undefined)).toBe('?');
    });

    it('keeps a whole emoji or accented letter as one initial', () => {
        expect(initialsOf('émile zola')).toBe('ÉZ');
        expect(initialsOf('😀 smile')).toBe('😀S');
    });
});

describe('participantSummary', () => {
    const people = (count) => Array.from({length: count}, (unused, index) => ({userId: `u-${index}`, name: `Person ${index}`}));

    it('lists everyone when there are few', () => {
        const summary = participantSummary(people(2));

        expect(summary.shown.map((person) => person.initials)).toEqual(['P0', 'P1']);
        expect(summary.overflow).toBe(0);
    });

    it('caps what is shown and counts the rest', () => {
        const summary = participantSummary(people(MAXIMUM_SHOWN_PARTICIPANTS + 4));

        expect(summary.shown).toHaveLength(MAXIMUM_SHOWN_PARTICIPANTS);
        expect(summary.overflow).toBe(4);
    });

    it('tolerates a missing list', () => {
        expect(participantSummary(undefined)).toEqual({shown: [], overflow: 0});
    });
});

describe('participantLabel', () => {
    const named = (...names) => names.map((name, index) => ({userId: `u-${index}`, name}));

    it('names one, two or three people', () => {
        expect(participantLabel(named('Jane Doe'))).toBe('Shared with Jane Doe');
        expect(participantLabel(named('Jane Doe', 'Bob Lee'))).toBe('Shared with Jane Doe and Bob Lee');
        expect(participantLabel(named('Jane Doe', 'Bob Lee', 'Al'))).toBe('Shared with Jane Doe, Bob Lee and Al');
    });

    it('counts the rest', () => {
        expect(participantLabel(named('Jane Doe', 'Bob Lee', 'Al', 'C', 'D'))).toBe('Shared with Jane Doe, Bob Lee, Al and 2 others');
        expect(participantLabel(named('Jane Doe', 'Bob Lee', 'Al', 'C'))).toBe('Shared with Jane Doe, Bob Lee, Al and 1 other');
    });

    it('still says shared when nobody is listed', () => {
        expect(participantLabel(undefined)).toBe('Shared chat');
    });
});
