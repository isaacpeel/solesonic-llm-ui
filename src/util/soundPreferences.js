const GAME_SOUNDS_ENABLED_STORAGE_KEY = 'solesonic.gameSoundsEnabled';

let gameSoundsEnabledForThisPage = true;

export function readGameSoundsEnabled() {
    try {
        const storedValue = localStorage.getItem(GAME_SOUNDS_ENABLED_STORAGE_KEY);

        return storedValue === null ? gameSoundsEnabledForThisPage : storedValue !== 'false';
    } catch {
        return gameSoundsEnabledForThisPage;
    }
}

export function writeGameSoundsEnabled(enabled) {
    gameSoundsEnabledForThisPage = enabled;

    try {
        localStorage.setItem(GAME_SOUNDS_ENABLED_STORAGE_KEY, String(enabled));
    } catch {
        // Storage can be blocked or full; the choice then lasts for this page only.
    }
}
