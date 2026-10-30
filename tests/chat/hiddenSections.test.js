import {describe, it, expect} from 'vitest';
import {HIDDEN_FROM_VIEWER_TEXT, presentForViewer} from '../../src/chat/message/hiddenSections.js';

const QUESTIONS = 'Round 1\n[[hidden:Sam]]\nQ1: Name a fruit\n[[/hidden]]\nGood luck!';

describe('presentForViewer', () => {
    it('shows a listed viewer the lock instead of the section', () => {
        const presented = presentForViewer(QUESTIONS, 'Sam');

        expect(presented).toContain(HIDDEN_FROM_VIEWER_TEXT);
        expect(presented).not.toContain('Name a fruit');
        expect(presented).not.toContain('[[');
        expect(presented).toContain('Round 1');
        expect(presented).toContain('Good luck!');
    });

    it('shows an unlisted viewer the body under a caption naming who cannot see it', () => {
        const presented = presentForViewer(QUESTIONS, 'Alex');

        expect(presented).toContain('> 👁 *Hidden from Sam*');
        expect(presented).toContain('Q1: Name a fruit');
        expect(presented).not.toContain(HIDDEN_FROM_VIEWER_TEXT);
        expect(presented).not.toContain('[[');
    });

    it('sets the blockquote apart with blank lines', () => {
        expect(presentForViewer('Before[[hidden:Sam]]secret[[/hidden]]After', 'Sam'))
            .toBe(`Before\n\n${HIDDEN_FROM_VIEWER_TEXT}\n\nAfter`);
    });

    it('matches names case-insensitively, in the marker and for the viewer', () => {
        expect(presentForViewer('[[HIDDEN:sam]]secret[[/HIDDEN]]', 'SAM')).toBe(HIDDEN_FROM_VIEWER_TEXT);
        expect(presentForViewer('[[hidden: Alex , sam ]]secret[[/hidden]]', 'Sam')).toBe(HIDDEN_FROM_VIEWER_TEXT);
    });

    it('names every hidden-from participant in the caption', () => {
        expect(presentForViewer('[[hidden:Sam,Kim]]secret[[/hidden]]', 'Alex')).toContain('Hidden from Sam and Kim');
    });

    it('handles two sections in one message independently', () => {
        const text = 'A[[hidden:Sam]]for Alex[[/hidden]]B[[hidden:Alex]]for Sam[[/hidden]]C';

        const forSam = presentForViewer(text, 'Sam');
        expect(forSam).not.toContain('for Alex');
        expect(forSam).toContain('for Sam');
        expect(forSam).toContain('Hidden from Alex');
        expect(forSam).toContain(HIDDEN_FROM_VIEWER_TEXT);

        const forAlex = presentForViewer(text, 'Alex');
        expect(forAlex).toContain('for Alex');
        expect(forAlex).not.toContain('for Sam');
    });

    it('hides an unclosed section to the end of the text', () => {
        const text = 'Your questions:[[hidden:Sam]]Q1: Name a fruit\nQ2: Name a color';

        const forSam = presentForViewer(text, 'Sam');
        expect(forSam).toContain(HIDDEN_FROM_VIEWER_TEXT);
        expect(forSam).not.toContain('Q1');
        expect(forSam).not.toContain('Q2');

        const forAlex = presentForViewer(text, 'Alex');
        expect(forAlex).toContain('Q2: Name a color');
    });

    it('drops a partial opener at the end of a streaming chunk', () => {
        for (const partial of ['[[', '[[hid', '[[hidden:', '[[hidden:Sa', '[[hidden:Sam]']) {
            expect(presentForViewer(`Get ready ${partial}`, 'Alex')).toBe('Get ready ');
        }
    });

    it('drops a partial closer at the end of an unclosed section', () => {
        const presented = presentForViewer('[[hidden:Sam]]secret[[/hid', 'Alex');

        expect(presented).toContain('secret');
        expect(presented).not.toContain('[[');
    });

    it('returns the identical string when there are no markers', () => {
        const text = 'Survey says… **42** people said apple.';

        expect(presentForViewer(text, 'Sam')).toBe(text);
        expect(presentForViewer('', 'Sam')).toBe('');
    });

    it('leaves double brackets that are not markers alone', () => {
        const text = 'An array [[1, 2], [3, 4]] here';

        expect(presentForViewer(text, 'Sam')).toBe(text);
    });

    it('fails closed for an unknown viewer', () => {
        for (const viewerName of [null, undefined, '', '   ']) {
            const presented = presentForViewer(QUESTIONS, viewerName);

            expect(presented).toContain(HIDDEN_FROM_VIEWER_TEXT);
            expect(presented).not.toContain('Name a fruit');
        }
    });

    it('treats a marker inside a code fence as a marker', () => {
        const presented = presentForViewer('```\n[[hidden:Sam]]secret[[/hidden]]\n```', 'Sam');

        expect(presented).not.toContain('secret');
        expect(presented).toContain(HIDDEN_FROM_VIEWER_TEXT);
    });
});
