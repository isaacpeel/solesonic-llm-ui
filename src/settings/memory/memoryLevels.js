import {GROUPS} from '../../authorizer/roles.js';

export const MEMORY_LEVELS = [
    {
        level: 'mine',
        label: 'My Memory',
        requiresGroup: null,
        description: 'What has been learned about you, where it came from, and the means to fix it.'
    },
    {
        level: 'all',
        label: 'All Memories',
        requiresGroup: GROUPS.IZZY_BOT_ADMIN,
        description: "Every user's memories, superseded ones included. Filter by user, status or kind."
    },
    {
        level: 'reflections',
        label: 'Reflections',
        requiresGroup: GROUPS.IZZY_BOT_ADMIN,
        description: 'Reflection progress for each conversation.'
    },
    {
        level: 'status',
        label: 'Status',
        requiresGroup: GROUPS.IZZY_BOT_ADMIN,
        description: 'Background process settings, the reflection backlog, and per-user counts.'
    }
];

export const DEFAULT_MEMORY_LEVEL = 'mine';

export const findMemoryLevel = (level) => {
    return MEMORY_LEVELS.find((memoryLevel) => memoryLevel.level === level) ?? null;
};

export const visibleMemoryLevels = (hasGroup) => {
    return MEMORY_LEVELS.filter((memoryLevel) => {
        if (!memoryLevel.requiresGroup) {
            return true;
        }

        return hasGroup(memoryLevel.requiresGroup);
    });
};
