export const MINIMUM_SEARCH_QUERY_LENGTH = 2;

export const MAXIMUM_SEARCH_QUERY_LENGTH = 200;

export const SEARCH_DEBOUNCE_MILLISECONDS = 275;

/*
 * The query the server will accept, or null for "show the normal listing". The server trims and
 * answers 400 outside 2–200 characters, so anything shorter is never sent.
 */
export function normalizeSearchQuery(text) {
    if (typeof text !== "string") {
        return null;
    }

    const trimmedText = text.trim();

    if (trimmedText.length < MINIMUM_SEARCH_QUERY_LENGTH) {
        return null;
    }

    return trimmedText.slice(0, MAXIMUM_SEARCH_QUERY_LENGTH);
}

/*
 * Splits text around a highlighted range. The server's offsets are JS string indices, so they
 * are used as given; a range that falls outside the text yields no highlight rather than a guess.
 */
export function splitHighlight(text, highlightStart, highlightLength) {
    if (typeof text !== "string") {
        return {before: "", match: "", after: ""};
    }

    const validRange = Number.isInteger(highlightStart)
        && Number.isInteger(highlightLength)
        && highlightStart >= 0
        && highlightLength > 0
        && highlightStart + highlightLength <= text.length;

    if (!validRange) {
        return {before: text, match: "", after: ""};
    }

    return {
        before: text.slice(0, highlightStart),
        match: text.slice(highlightStart, highlightStart + highlightLength),
        after: text.slice(highlightStart + highlightLength),
    };
}

/* Only used when the chat's name matched, so a plain case-insensitive find is enough. */
export function splitLabelHighlight(label, query) {
    if (typeof label !== "string" || typeof query !== "string" || query === "") {
        return splitHighlight(label, null, null);
    }

    const matchIndex = label.toLowerCase().indexOf(query.toLowerCase());

    return splitHighlight(label, matchIndex, query.length);
}
