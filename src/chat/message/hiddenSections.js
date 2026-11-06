const MARKER_START = '[[';
const OPENER_PREFIX = '[[hidden:';
const CLOSER = '[[/hidden]]';
const OPENER_PATTERN = /\[\[hidden:([^\]]*)]]/gi;

export const HIDDEN_FROM_VIEWER_TEXT = '> 🔒 *Hidden from you until everyone has played.*';

function hiddenFromCaption(names) {
    return `> 👁 *Hidden from ${names.join(' and ')}*`;
}

function parseNames(nameList) {
    return nameList.split(',').map((name) => name.trim()).filter(Boolean);
}

function isHiddenFromViewer(names, viewerName) {
    const normalizedViewer = typeof viewerName === 'string' ? viewerName.trim().toLowerCase() : '';

    if (!normalizedViewer || names.length === 0) {
        return true;
    }

    return names.some((name) => name.toLowerCase() === normalizedViewer);
}

function withoutPartialMarker(text, isPartial) {
    const lastMarkerStart = text.lastIndexOf(MARKER_START);

    if (lastMarkerStart < 0) {
        return text;
    }

    return isPartial(text.slice(lastMarkerStart).toLowerCase()) ? text.slice(0, lastMarkerStart) : text;
}

function isPartialOpener(tail) {
    return OPENER_PREFIX.startsWith(tail) || (tail.startsWith(OPENER_PREFIX) && !tail.includes(']]'));
}

function isPartialCloser(tail) {
    return CLOSER.startsWith(tail);
}

function presentSection(body, names, viewerName) {
    if (isHiddenFromViewer(names, viewerName)) {
        return `\n\n${HIDDEN_FROM_VIEWER_TEXT}\n\n`;
    }

    return `\n\n${hiddenFromCaption(names)}\n\n${body}\n\n`;
}

export function presentForViewer(text, viewerName) {
    if (typeof text !== 'string' || !text.includes(MARKER_START)) {
        return text;
    }

    const lowerText = text.toLowerCase();
    const parts = [];
    let position = 0;
    let foundSection = false;

    OPENER_PATTERN.lastIndex = 0;

    for (let match = OPENER_PATTERN.exec(text); match; match = OPENER_PATTERN.exec(text)) {
        foundSection = true;
        parts.push(text.slice(position, match.index));

        const bodyStart = match.index + match[0].length;
        const closerIndex = lowerText.indexOf(CLOSER, bodyStart);
        const body = closerIndex < 0
            ? withoutPartialMarker(text.slice(bodyStart), isPartialCloser)
            : text.slice(bodyStart, closerIndex);

        parts.push(presentSection(body, parseNames(match[1]), viewerName));
        position = closerIndex < 0 ? text.length : closerIndex + CLOSER.length;
        OPENER_PATTERN.lastIndex = position;
    }

    const remainder = withoutPartialMarker(text.slice(position), isPartialOpener);

    if (!foundSection) {
        return remainder.length === text.length ? text : remainder;
    }

    parts.push(remainder);

    return parts.join('').trim();
}
