const ACTIVE_TURNS_STORAGE_KEY = 'chat.activeTurns';

export const ACTIVE_TURN_RETENTION_MILLISECONDS = 15 * 60 * 1000;

let entriesInMemory = {};

function loadEntries() {
    try {
        const storedValue = globalThis.sessionStorage?.getItem(ACTIVE_TURNS_STORAGE_KEY);

        if (!storedValue) {
            return {...entriesInMemory};
        }

        const parsedEntries = JSON.parse(storedValue);

        return parsedEntries && typeof parsedEntries === 'object' ? parsedEntries : {};
    } catch {
        return {...entriesInMemory};
    }
}

function saveEntries(entries) {
    entriesInMemory = entries;

    try {
        globalThis.sessionStorage?.setItem(ACTIVE_TURNS_STORAGE_KEY, JSON.stringify(entries));
    } catch {
        // The in-memory copy still serves this page; only a reload loses it.
    }
}

const activeTurnRegistry = {
    remember: (chatId, {runStartedEventId, userMessageId} = {}, now = Date.now()) => {
        if (!chatId || !runStartedEventId) {
            return;
        }

        saveEntries({
            ...loadEntries(),
            [chatId]: {runStartedEventId, userMessageId: userMessageId ?? null, updatedAt: now},
        });
    },

    read: (chatId, now = Date.now()) => {
        if (!chatId) {
            return null;
        }

        const entry = loadEntries()[chatId];

        if (!entry || now - entry.updatedAt > ACTIVE_TURN_RETENTION_MILLISECONDS) {
            return null;
        }

        return entry;
    },

    forget: (chatId) => {
        if (!chatId) {
            return;
        }

        const remainingEntries = loadEntries();
        delete remainingEntries[chatId];
        saveEntries(remainingEntries);
    },
};

export default activeTurnRegistry;
