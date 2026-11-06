import {describe, expect, it} from 'vitest';
import {modelLabel, visibleModels} from '../src/util/modelLabels.js';

const MODELS = [
    {id: 'auto-kev', ownedBy: 'openai', displayName: 'auto', hidden: false},
    {id: 'nba-agent', ownedBy: 'openai', displayName: 'nba-agent', hidden: true},
    {id: 'qwen3-8b', ownedBy: 'openai'},
];

describe('modelLabel', () => {
    it('uses the display name, matching the id ignoring case', () => {
        expect(modelLabel(MODELS, 'auto-kev')).toBe('auto');
        expect(modelLabel(MODELS, 'Auto-Kev')).toBe('auto');
    });

    it('falls back to the id when no display name is known', () => {
        expect(modelLabel(MODELS, 'qwen3-8b')).toBe('qwen3-8b');
        expect(modelLabel(MODELS, 'not-listed')).toBe('not-listed');
        expect(modelLabel(null, 'auto-kev')).toBe('auto-kev');
    });

    it('labels a hidden model too', () => {
        expect(modelLabel(MODELS, 'nba-agent')).toBe('nba-agent');
    });

    it('passes an empty id through', () => {
        expect(modelLabel(MODELS, null)).toBeNull();
        expect(modelLabel(MODELS, undefined)).toBeUndefined();
    });
});

describe('visibleModels', () => {
    it('leaves out hidden models and keeps ones without the flag', () => {
        expect(visibleModels(MODELS).map((model) => model.id)).toEqual(['auto-kev', 'qwen3-8b']);
    });

    it('treats a missing list as empty', () => {
        expect(visibleModels(undefined)).toEqual([]);
    });
});
