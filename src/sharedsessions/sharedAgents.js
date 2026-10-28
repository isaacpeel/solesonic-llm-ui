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

export function isKnownSharedAgent(agentName) {
    return typeof agentName === 'string' && Object.hasOwn(SHARED_AGENTS, agentName);
}

export function sharedAgentFor(agentName) {
    if (isKnownSharedAgent(agentName)) {
        return SHARED_AGENTS[agentName];
    }

    return {...FALLBACK_AGENT, label: agentName || 'a shared session'};
}

export function forKnownSharedAgents(items) {
    return (Array.isArray(items) ? items : []).filter((item) => isKnownSharedAgent(item?.agentName));
}

export function describeInvitation(agentName, openingMessage) {
    const agent = sharedAgentFor(agentName);
    const opening = agent.openings.find((candidate) => candidate.openingMessage === openingMessage);

    return opening ? `${agent.label} · ${opening.label}` : agent.label;
}
