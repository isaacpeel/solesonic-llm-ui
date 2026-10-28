export const AGENT_SOUNDS_ENABLED_STORAGE_KEY = 'solesonic.gameSoundsEnabled';

let agentSoundsEnabledForThisPage = true;

export function readAgentSoundsEnabled() {
    try {
        const storedValue = localStorage.getItem(AGENT_SOUNDS_ENABLED_STORAGE_KEY);

        return storedValue === null ? agentSoundsEnabledForThisPage : storedValue !== 'false';
    } catch {
        return agentSoundsEnabledForThisPage;
    }
}

export function writeAgentSoundsEnabled(enabled) {
    agentSoundsEnabledForThisPage = enabled;

    try {
        localStorage.setItem(AGENT_SOUNDS_ENABLED_STORAGE_KEY, String(enabled));
    } catch {
        // Storage can be blocked or full; the choice then lasts for this page only.
    }
}
