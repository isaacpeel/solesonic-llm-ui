/**
 * Markdown streaming repair helper
 *
 * ROOT CAUSE ANALYSIS — why markdown looks “late” during streaming
 *
 * Incremental markdown parsing:
 * - Markdown parsers (like react-markdown/remark) work best when they receive a complete, syntactically valid document.
 * - While content is streaming, the text is often incomplete. Typical examples:
 *   - Code fences start with ``` but the closing ``` has not arrived yet.
 *   - Inline code begins with a single backtick ` but is missing its closing backtick.
 *   - Links like [title](https://example.com are missing the final ")".
 * - When the document is syntactically incomplete, the parser frequently falls back to plain text,
 *   so formatting appears only after the missing closing token arrives — which feels “late”.
 *
 * Why this is visible with streaming:
 * - Large responses with code blocks and lists only become valid near the end.
 * - The UI re-renders on every chunk, but the parser keeps receiving a partially broken document, so
 *   formatting “snaps into place” only when the final tokens show up.
 *
 * What already works vs. what is missing:
 * - The streaming state updates React state correctly on each chunk, and ReactMarkdown re-renders.
 * - The real issue is not re-rendering — it is that ReactMarkdown receives an invalid/unfinished markdown string.
 *
 * SOLUTION: a small, localized “repair layer” for streaming display only.
 * - Keep the raw model text intact for storage (no mutation of the source string).
 * - For the on-screen display during streaming, temporarily close the most common unfinished constructs so the
 *   parser can apply formatting earlier.
 * - Once the final message arrives, stop adding synthetic closures.
 */

/**
 * Build a display-safe markdown string during streaming.
 *
 * IMPORTANT:
 * - This function MUST NOT mutate the semantic content of the raw text. It only adds temporary closing tokens
 *   to help the markdown engine while streaming. Final text (isFinal === true) should not include synthetic tokens.
 * - Keep operations simple and fast (string scans and small regexes), because the function is called frequently.
 *
 * Handled constructs when isFinal !== true:
 * - Unclosed code fences (```... -> append a closing ```)
 * - Unclosed inline code (`... -> append `)
 * - Unclosed link parentheses: [text](url -> append )
 * - Bare list markers (-, *, 1.) at end of line -> append a non-breaking space so they render as list items
 */
export function buildStreamingMarkdownDisplay(raw, { isFinal = false } = {}) {
    const input = typeof raw === 'string' ? raw : String(raw ?? '');

    // Normalize line endings and optionally collapse excessive blank lines for display stability
    let text = input.replace(/\r\n/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n');

    if (isFinal) {
        // Do not add any synthetic tokens in the final state.
        return text;
    }

    // Compute streaming repairs:
    // Pass 1: scan for code fences and inline backticks state so we can decide what to close at the end.
    let inCodeFence = false;
    let inlineBacktickOpen = false;

    // We only toggle inlineBacktickOpen when NOT inside a code fence and when backtick count is exactly 1.
    for (let charIndex = 0; charIndex < text.length; charIndex += 1) {
        const currentChar = text[charIndex];

        if (currentChar === '`') {
            // Count how many consecutive backticks start here
            let runLength = 1;
            let lookahead = charIndex + 1;

            while (lookahead < text.length && text[lookahead] === '`') {
                runLength += 1;
                lookahead += 1;
            }

            if (runLength >= 3) {
                // Treat 3+ backticks as a fence marker
                inCodeFence = !inCodeFence;
                charIndex = lookahead - 1;
                continue;
            }

            if (!inCodeFence && runLength === 1) {
                // Toggle inline code state outside fences
                inlineBacktickOpen = !inlineBacktickOpen;
                charIndex = lookahead - 1;
                continue;
            }

            // For runLength == 2 (``), do nothing special — uncommon in our UX and most parsers handle it.
            charIndex = lookahead - 1;

        }
    }

    // Pass 2: unclosed links — if there is a "[...](..." without a closing ")" at the end, add one.
    // Heuristic, intentionally simple for streaming. We only look at the last occurrence.
    const lastLinkOpen = text.lastIndexOf('](');
    let hasUnclosedLink = lastLinkOpen !== -1 && text.indexOf(')', lastLinkOpen) === -1;

    // Pass 3: unfinished list markers. Ensure lines ending with just a marker render as list items.
    // We add a NBSP to the end of such lines to give the parser a minimal content to latch onto.
    const lines = text.split('\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];

        if (/^\s*(?:[-*]|\d+\.)\s*$/.test(line)) {
            // Convert bare marker to marker + NBSP (non-breaking space)
            lines[lineIndex] = line.replace(/\s*$/, ' \u00A0');
        }
    }
    text = lines.join('\n');

    // Pass 4: display-only space normalization outside code fences and inline code.
    // Goal: avoid visual "extra spaces" caused by chunk boundaries (e.g., both chunks include a boundary space).
    // Rules (streaming only):
    // - Outside fenced or inline code: collapse runs of interior spaces to a single space.
    // - Preserve up to two trailing spaces at the end of a line (Markdown hard line break).
    // - Do not alter any characters inside fenced or inline code.
    text = normalizeSpacesForStreaming(text);

    // Finally, apply closers in a safe order. We prefer closing fences first so that other repairs
    // are not accidentally interpreted inside an open fence.
    if (inCodeFence) {
        // Ensure the fence closes on a new line to avoid swallowing trailing text.
        if (!text.endsWith('\n')) {
            text += '\n';
        }
        text += '```';
    }

    if (inlineBacktickOpen) {
        text += '`';
    }

    // Avoid appending a link closer if we are still inside a code fence — everything is code there.
    if (hasUnclosedLink && !inCodeFence) {
        text += ')';
    }

    return text;
}

export default buildStreamingMarkdownDisplay;

/**
 * Streaming-only space normalization.
 *
 * IMPORTANT: We must avoid changing spacing in code (fenced or inline). For non-code text, collapse interior
 * runs of multiple spaces to a single space, but preserve Markdown's hard line break (two trailing spaces).
 * This helps mitigate temporary double-spaces that appear when two adjacent chunks each include a boundary space.
 */
function normalizeSpacesForStreaming(fullText) {
    const lines = fullText.split('\n');

    let insideFence = false;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const currentLine = lines[lineIndex];

        const hasFenceMarker = currentLine.includes('```');

        if (insideFence) {
            // Keep code fence content exactly as-is
            lines[lineIndex] = currentLine;

        } else {
            // If the line starts with 4+ spaces or a tab, it is an indented code block in Markdown. Preserve as-is.
            if (/^(?: {4,}|\t)/.test(currentLine)) {
                lines[lineIndex] = currentLine;
            } else {
                // Normalize spaces outside fences while respecting inline code (`...`).
                lines[lineIndex] = normalizeSpacesOutsideInlineCode(currentLine);
            }
        }

        if (hasFenceMarker) {
            insideFence = !insideFence;
        }
    }

    return lines.join('\n');
}

function normalizeSpacesOutsideInlineCode(line) {
    // Process a single line, collapsing interior spaces outside inline code segments delimited by single backticks.
    // Inline code in Markdown does not span newlines, so per-line processing is safe.
    let insideInline = false;
    let result = '';
    let pendingSpaceCount = 0;
    let hasSeenNonSpace = false;

    for (let charIndex = 0; charIndex < line.length; charIndex += 1) {
        const character = line[charIndex];

        if (character === '`') {

            if (pendingSpaceCount > 0) {
                // Flush pending spaces before toggling into/out of inline code.
                // Preserve leading spaces exactly until first non-space appears; otherwise collapse to one.
                if (!hasSeenNonSpace) {
                    result += ' '.repeat(pendingSpaceCount);
                } else {
                    result += ' ';
                }
                pendingSpaceCount = 0;
            }

            insideInline = !insideInline;
            result += '`';
            continue;
        }

        if (insideInline) {
            // Preserve characters exactly inside inline code
            if (pendingSpaceCount > 0) {
                result += ' '.repeat(pendingSpaceCount);
                pendingSpaceCount = 0;
            }
            result += character;
            continue;
        }

        if (character === ' ') {
            pendingSpaceCount += 1;
            continue;
        }

        if (pendingSpaceCount > 0) {
            // For leading spaces (before first non-space), preserve as-is. After first non-space, collapse to one.
            if (!hasSeenNonSpace) {
                result += ' '.repeat(pendingSpaceCount);
            } else {
                result += ' ';
            }
            pendingSpaceCount = 0;
        }

        if (!hasSeenNonSpace && character !== ' ') {
            hasSeenNonSpace = true;
        }
        result += character;
    }

    // Handle trailing spaces: preserve up to two for Markdown hard break
    if (!insideInline && pendingSpaceCount > 0) {
        if (pendingSpaceCount >= 2) {
            result += '  ';

        } else {
            result += ' ';
        }
    }

    return result;
}
