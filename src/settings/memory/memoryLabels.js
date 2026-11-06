import {formatRelativeTime} from '../../util/relativeTime.js';

export const MEMORY_KINDS = {
    FACT: 'FACT',
    PREFERENCE: 'PREFERENCE',
    INSTRUCTION: 'INSTRUCTION',
};

export const MEMORY_ORIGINS = {
    INFERRED: 'INFERRED',
    REMEMBERED: 'REMEMBERED',
    AUTHORED: 'AUTHORED',
};

export const MEMORY_STATUSES = {
    ACTIVE: 'ACTIVE',
    PENDING: 'PENDING',
    SUPERSEDED: 'SUPERSEDED',
};

export const REFLECTION_STATUSES = {
    PENDING: 'PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
};

export const KIND_SECTIONS = [
    {kind: MEMORY_KINDS.INSTRUCTION, heading: 'Standing instructions'},
    {kind: MEMORY_KINDS.PREFERENCE, heading: 'Preferences'},
    {kind: MEMORY_KINDS.FACT, heading: 'Facts'},
];

export const KIND_LABELS = {
    [MEMORY_KINDS.INSTRUCTION]: 'Instruction',
    [MEMORY_KINDS.PREFERENCE]: 'Preference',
    [MEMORY_KINDS.FACT]: 'Fact',
};

export const ORIGIN_LABELS = {
    [MEMORY_ORIGINS.INFERRED]: 'Learned',
    [MEMORY_ORIGINS.REMEMBERED]: 'Remembered',
    [MEMORY_ORIGINS.AUTHORED]: 'Added by you',
};

export const STATUS_LABELS = {
    [MEMORY_STATUSES.ACTIVE]: 'Active',
    [MEMORY_STATUSES.PENDING]: 'Pending',
    [MEMORY_STATUSES.SUPERSEDED]: 'Superseded',
};

export const REFLECTION_STATUS_LABELS = {
    [REFLECTION_STATUSES.PENDING]: 'Pending',
    [REFLECTION_STATUSES.IN_PROGRESS]: 'In progress',
    [REFLECTION_STATUSES.COMPLETED]: 'Completed',
    [REFLECTION_STATUSES.FAILED]: 'Failed',
};

export const PENDING_HINT = "Learned once. It's used after it comes up in a second conversation.";

export const SAVE_REJECTED_MESSAGE = "The memory couldn't be saved. Check that it isn't empty or too long.";

export const NO_ADMIN_ACCESS_MESSAGE = "You don't have access to memory administration.";

const OTHER_USER_AUTHORED_LABEL = 'Added by the user';

export const originLabel = (origin, isOwnMemory = true) => {
    if (origin === MEMORY_ORIGINS.AUTHORED && !isOwnMemory) {
        return OTHER_USER_AUTHORED_LABEL;
    }

    return ORIGIN_LABELS[origin] ?? origin;
};

export const formatConfidence = (confidence) => {
    if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
        return null;
    }

    return `${Math.round(confidence * 100)}%`;
};

export const shortId = (identifier) => {
    if (!identifier) {
        return '';
    }

    return String(identifier).slice(0, 8);
};

export const userLabel = (username, userId) => username || shortId(userId);

export const isEpoch = (timestamp) => {
    if (!timestamp) {
        return false;
    }

    return new Date(timestamp).getTime() === 0;
};

export const formatRelativeTimestamp = (timestamp) => {
    if (!timestamp) {
        return null;
    }

    return formatRelativeTime(new Date(timestamp));
};
