export const MAXIMUM_SHOWN_PARTICIPANTS = 3;

export function isSharedChat(chat) {
    return chat?.kind === 'SHARED' && !!chat.sharedSessionId;
}

export function isSharedChatOwner(chat, viewerUserId) {
    return !!viewerUserId && chat?.ownerUserId === viewerUserId;
}

export function initialsOf(name) {
    const words = typeof name === 'string' ? name.trim().split(/\s+/).filter(Boolean) : [];

    if (words.length === 0) {
        return '?';
    }

    return words
        .slice(0, 2)
        .map((word) => Array.from(word)[0].toUpperCase())
        .join('');
}

export function participantSummary(participants) {
    const people = Array.isArray(participants) ? participants : [];

    return {
        shown: people.slice(0, MAXIMUM_SHOWN_PARTICIPANTS).map((person) => ({
            userId: person.userId,
            name: person.name,
            initials: initialsOf(person.name),
        })),
        overflow: Math.max(people.length - MAXIMUM_SHOWN_PARTICIPANTS, 0),
    };
}

export function participantLabel(participants) {
    const {shown, overflow} = participantSummary(participants);
    const names = shown.map((person) => person.name).filter(Boolean);

    if (names.length === 0) {
        return 'Shared chat';
    }

    const tail = overflow > 0 ? `${overflow} ${overflow === 1 ? 'other' : 'others'}` : names.pop();
    const head = names.join(', ');

    return `Shared with ${head ? `${head} and ${tail}` : tail}`;
}
