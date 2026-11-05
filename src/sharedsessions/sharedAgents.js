const CONVERSATION_MODE = 'CONVERSATION';

export const SHARED_AGENTS = {
    feud: {
        label: 'Family Feud',
        openings: [
            {openingMessage: 'new show', label: 'The whole show'},
            {openingMessage: 'new main game', label: 'Main Game'},
        ],
        idleHint: 'Say “new game” to start.',
        waitingHint: 'you can ask for the board or the rules',
        completedText: 'The show is over. Play again?',
    },
};

export const SHARED_AGENT_NAMES = Object.keys(SHARED_AGENTS);

const FALLBACK_AGENT = {
    openings: [],
    idleHint: 'Send a message to start.',
    waitingHint: null,
    completedText: 'This session is complete.',
};

export const CONVERSATION_PRESET = {
    label: 'Shared chat',
    openings: [],
    idleHint: 'Send a message to start.',
    waitingHint: null,
    completedText: '',
};

export function isKnownSharedAgent(agentName) {
    return typeof agentName === 'string' && Object.hasOwn(SHARED_AGENTS, agentName);
}

export function sharedAgentFor(agentName) {
    if (isKnownSharedAgent(agentName)) {
        return SHARED_AGENTS[agentName];
    }

    return {...FALLBACK_AGENT, label: agentName || 'a shared session'};
}

export function isConversationSession(item) {
    return item?.mode === CONVERSATION_MODE;
}

export function sharedAgentForSession(session) {
    if (isConversationSession(session)) {
        return {...CONVERSATION_PRESET, label: session.name?.trim() || CONVERSATION_PRESET.label};
    }

    return sharedAgentFor(session?.agentName);
}

export function forSupportedSessions(items) {
    return (Array.isArray(items) ? items : []).filter((item) => isConversationSession(item) || isKnownSharedAgent(item?.agentName));
}

export function conversationStatusText(session, {running = false} = {}) {
    if (session?.status === 'CLOSED') {
        return 'Ended';
    }

    if (session?.status === 'EXPIRED') {
        return 'Expired';
    }

    if (running) {
        return 'Running…';
    }

    const updated = new Date(session?.updated);

    return Number.isNaN(updated.getTime()) ? '' : `Updated ${updated.toLocaleString()}`;
}

export function describeInvitation(agentName, openingMessage, mode, sessionName) {
    if (mode === CONVERSATION_MODE) {
        const name = sessionName?.trim();

        return name ? `${CONVERSATION_PRESET.label} · ${name}` : CONVERSATION_PRESET.label;
    }

    const agent = sharedAgentFor(agentName);
    const opening = agent.openings.find((candidate) => candidate.openingMessage === openingMessage);

    return opening ? `${agent.label} · ${opening.label}` : agent.label;
}
