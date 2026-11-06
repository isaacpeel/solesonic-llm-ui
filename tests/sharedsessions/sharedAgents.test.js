import {describe, it, expect} from 'vitest';
import {
    SHARED_AGENT_NAMES,
    describeInvitation,
    conversationStatusText,
    forSupportedSessions,
    isConversationSession,
    isKnownSharedAgent,
    sharedAgentFor,
    sharedAgentForSession,
} from '../../src/sharedsessions/sharedAgents.js';

describe('sharedAgents', () => {
    it('knows the feud agent and nothing it was not told about', () => {
        expect(SHARED_AGENT_NAMES).toContain('feud');
        expect(isKnownSharedAgent('feud')).toBe(true);
        expect(isKnownSharedAgent('weather')).toBe(false);
        expect(isKnownSharedAgent(undefined)).toBe(false);
        expect(isKnownSharedAgent('toString')).toBe(false);
    });

    it('keeps sessions and invites for a known agent or a conversation, and nothing else', () => {
        const items = [
            {id: 'a', agentName: 'feud'},
            {id: 'b', agentName: 'weather'},
            {id: 'c'},
            {id: 'd', mode: 'CONVERSATION', agentName: null},
            {id: 'e', mode: 'AGENT', agentName: 'weather'},
            {id: 'f', mode: 'AGENT', agentName: 'feud'},
        ];

        expect(forSupportedSessions(items).map((item) => item.id)).toEqual(['a', 'd', 'f']);
        expect(forSupportedSessions(null)).toEqual([]);
        expect(forSupportedSessions(undefined)).toEqual([]);
    });

    it('recognises a conversation session by its mode', () => {
        expect(isConversationSession({mode: 'CONVERSATION'})).toBe(true);
        expect(isConversationSession({mode: 'AGENT'})).toBe(false);
        expect(isConversationSession({agentName: 'feud'})).toBe(false);
        expect(isConversationSession(null)).toBe(false);
    });

    it('labels a conversation with its name and gives it conversation wording', () => {
        const preset = sharedAgentForSession({mode: 'CONVERSATION', name: 'Trip planning'});

        expect(preset.label).toBe('Trip planning');
        expect(preset.idleHint).toBe('Send a message to start.');
        expect(preset.waitingHint).toBeNull();
        expect(preset.completedText).toBe('');
        expect(preset.openings).toEqual([]);
    });

    it('labels an unnamed conversation as a shared chat', () => {
        expect(sharedAgentForSession({mode: 'CONVERSATION', name: '  '}).label).toBe('Shared chat');
        expect(sharedAgentForSession({mode: 'CONVERSATION'}).label).toBe('Shared chat');
    });

    it('uses the agent for an agent session', () => {
        expect(sharedAgentForSession({mode: 'AGENT', agentName: 'feud'}).label).toBe('Family Feud');
        expect(sharedAgentForSession(null).label).toBe('a shared session');
    });

    it('falls back to generic wording for an agent it does not know', () => {
        const agent = sharedAgentFor('weather');

        expect(agent.label).toBe('weather');
        expect(agent.openings).toEqual([]);
        expect(agent.waitingHint).toBeNull();
    });

    it('describes an invitation by its agent and, when known, how it opens', () => {
        expect(describeInvitation('feud', 'new show')).toBe('Family Feud · Full show (Main Games, Fast Money, Big Money)');
        expect(describeInvitation('feud', 'something else')).toBe('Family Feud');
        expect(describeInvitation('weather', 'hello')).toBe('weather');
    });

    it('describes a conversation invitation by the session name', () => {
        expect(describeInvitation(null, null, 'CONVERSATION', 'Trip planning')).toBe('Shared chat · Trip planning');
        expect(describeInvitation(null, null, 'CONVERSATION', '')).toBe('Shared chat');
        expect(describeInvitation(null, null, 'CONVERSATION')).toBe('Shared chat');
    });

    it('says a conversation is running while a run is active, else when it last changed', () => {
        expect(conversationStatusText({updated: '2026-11-05T12:00:00Z'}, {running: true})).toBe('Running…');
        expect(conversationStatusText({updated: '2026-11-05T12:00:00Z'})).toMatch(/^Updated .*2026/);
        expect(conversationStatusText({status: 'CLOSED', updated: '2026-11-05T12:00:00Z'}, {running: true})).toBe('Ended');
        expect(conversationStatusText({status: 'EXPIRED'})).toBe('Expired');
        expect(conversationStatusText({})).toBe('');
        expect(conversationStatusText({updated: 'not a date'})).toBe('');
    });
});
