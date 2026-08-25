import './MessageResponseMetadata.css';

const MISSING_VALUE_LABEL = '—';

function formatTokenCount(value) {
    return typeof value === 'number' ? value.toLocaleString() : MISSING_VALUE_LABEL;
}

function formatMillisAsDuration(value) {
    if (typeof value !== 'number') {
        return MISSING_VALUE_LABEL;
    }

    return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`;
}

/*
 * All fields shown inline, not tucked behind a hover tooltip — the whole point is to be visible
 * at a glance (and in a screenshot). tokensPerSecond is omitted when null (delegated A2A turns
 * do not report it); durationMillis is the one field the backend guarantees on every route.
 */
function buildMetadataText({promptTokens, completionTokens, totalTokens, tokensPerSecond, timeToFirstTokenMillis, durationMillis}) {
    const segments = [
        `tok:${formatTokenCount(totalTokens)}`,
    ];

    if (typeof tokensPerSecond === 'number') {
        segments.push(`${tokensPerSecond.toFixed(1)} tok/s`);
    }

    segments.push(`TTFT:${formatMillisAsDuration(timeToFirstTokenMillis)}`);

    return segments.join(' · ');
}

/*
 * Sits beside the model name in .message-actions. Absent entirely on a cancelled turn (the
 * whole responseMetadata object is null there) or on a message never sent through the `done`
 * event at all — e.g. one loaded from history before the backend added this field.
 */
function MessageResponseMetadata({responseMetadata}) {
    if (!responseMetadata) {
        return null;
    }

    return (
        <span className="message-response-metadata">
            {buildMetadataText(responseMetadata)}
        </span>
    );
}

export default MessageResponseMetadata;
