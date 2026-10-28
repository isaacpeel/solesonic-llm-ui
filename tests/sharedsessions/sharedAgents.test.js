import {describe, it, expect} from 'vitest';
import {
    SHARED_AGENT_NAMES,
    describeInvitation,
    forKnownSharedAgents,
    isKnownSharedAgent,
    sharedAgentFor,
} from '../../src/sharedsessions/sharedAgents.js';

describe('sharedAgents', () => {
    it('knows the feud agent and nothing it was not told about', () => {
        expect(SHARED_AGENT_NAMES).toContain('feud');
        expect(isKnownSharedAgent('feud')).toBe(true);
        expect(isKnownSharedAgent('weather')).toBe(false);
        expect(isKnownSharedAgent(undefined)).toBe(false);
        expect(isKnownSharedAgent('toString')).toBe(false);
    });

    it('keeps only sessions and invites for a known agent', () => {
        const items = [{id: 'a', agentName: 'feud'}, {id: 'b', agentName: 'weather'}, {id: 'c'}];

        expect(forKnownSharedAgents(items).map((item) => item.id)).toEqual(['a']);
        expect(forKnownSharedAgents(null)).toEqual([]);
    });

    it('falls back to generic wording for an agent it does not know', () => {
        const agent = sharedAgentFor('weather');

        expect(agent.label).toBe('weather');
        expect(agent.openings).toEqual([]);
        expect(agent.waitingHint).toBeNull();
    });

    it('describes an invitation by its agent and, when known, how it opens', () => {
        expect(describeInvitation('feud', 'new show')).toBe('Family Feud · The whole show');
        expect(describeInvitation('feud', 'something else')).toBe('Family Feud');
        expect(describeInvitation('weather', 'hello')).toBe('weather');
    });
});
