import {describe, it, expect} from 'vitest';
import {renderLatexArrows} from '../../src/util/latexArrows.js';

describe('renderLatexArrows', () => {
    it('converts dollar-wrapped simple arrow commands to unicode', () => {
        const raw = 'workspace $\\rightarrow$ Add Node $\\rightarrow$ loaders $\\rightarrow$ LoraLoader.';

        expect(renderLatexArrows(raw)).toBe('workspace → Add Node → loaders → LoraLoader.');
    });

    it('converts dollar-wrapped labeled arrow commands to unicode with the label kept', () => {
        const raw = 'Load Checkpoint $\\xrightarrow{MODEL/CLIP}$ LoraLoader $\\xrightarrow{MODEL}$ KSampler';

        expect(renderLatexArrows(raw)).toBe('Load Checkpoint → (MODEL/CLIP) LoraLoader → (MODEL) KSampler');
    });

    it('converts bare (non-dollar-wrapped) commands too', () => {
        expect(renderLatexArrows('A \\rightarrow B')).toBe('A → B');
        expect(renderLatexArrows('A \\xrightarrow{step} B')).toBe('A → (step) B');
    });

    it('handles the full family of arrow commands', () => {
        expect(renderLatexArrows('$\\leftarrow$')).toBe('←');
        expect(renderLatexArrows('$\\Rightarrow$')).toBe('⇒');
        expect(renderLatexArrows('$\\Leftarrow$')).toBe('⇐');
        expect(renderLatexArrows('$\\leftrightarrow$')).toBe('↔');
        expect(renderLatexArrows('$\\Leftrightarrow$')).toBe('⇔');
        expect(renderLatexArrows('$\\to$')).toBe('→');
        expect(renderLatexArrows('$\\longrightarrow$')).toBe('→');
        expect(renderLatexArrows('$\\longleftarrow$')).toBe('←');
        expect(renderLatexArrows('\\xleftarrow{back}')).toBe('← (back)');
    });

    it('does not mangle a longer command sharing a suffix with a shorter one', () => {
        /* \rightarrowtail is a real (if obscure) LaTeX command; must not become "→tail". */
        expect(renderLatexArrows('A \\rightarrowtail B')).toBe('A \\rightarrowtail B');
    });

    it('leaves ordinary text and currency untouched', () => {
        expect(renderLatexArrows('The total is $5 today.')).toBe('The total is $5 today.');
        expect(renderLatexArrows('no arrows here')).toBe('no arrows here');
    });

    it('passes through null/empty input unchanged', () => {
        expect(renderLatexArrows('')).toBe('');
        expect(renderLatexArrows(null)).toBe(null);
        expect(renderLatexArrows(undefined)).toBe(undefined);
    });
});
