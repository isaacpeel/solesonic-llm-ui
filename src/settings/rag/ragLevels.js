import { ROLES } from '../../authorizer/roles.js';

export const RAG_LEVELS = [
    {
        level: 'chat',
        scope: 'CHAT',
        label: 'Chat',
        requiresRole: null,
        requiresChatId: true,
        preferenceKey: 'chatSimilarityThreshold',
        documentsHeading: 'Documents from chats',
        description: "How closely a document must match a question before it's pulled into this conversation's context. Only documents attached to this chat are searched.",
        noChatMessage: 'No chat-level documents yet. Start a chat to attach some.'
    },
    {
        level: 'user',
        scope: 'USER',
        label: 'User',
        requiresRole: null,
        requiresChatId: false,
        preferenceKey: 'userSimilarityThreshold',
        documentsHeading: 'Your documents',
        description: "Applies across every document you've personally uploaded, regardless of which chat you're in.",
        noChatMessage: null
    },
    {
        level: 'global',
        scope: 'GLOBAL',
        label: 'Global',
        requiresRole: ROLES.RAG_ADMIN,
        requiresChatId: false,
        preferenceKey: 'globalSimilarityThreshold',
        documentsHeading: 'Global documents',
        description: 'Applies to the shared knowledge base every user in the workspace can draw from. Only admins can upload, refresh, or remove documents at this level.',
        noChatMessage: null
    }
];

export const DEFAULT_RAG_LEVEL = 'chat';

export const findRagLevel = (level) => {
    return RAG_LEVELS.find((ragLevel) => ragLevel.level === level) ?? null;
};

export const visibleRagLevels = (hasRole) => {
    return RAG_LEVELS.filter((ragLevel) => {
        if (!ragLevel.requiresRole) {
            return true;
        }

        return hasRole(ragLevel.requiresRole);
    });
};
