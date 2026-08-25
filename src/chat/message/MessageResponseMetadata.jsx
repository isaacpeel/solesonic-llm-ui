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
 * durationMillis is the one field the backend guarantees on every route, token-reporting or
 * not, so it is the fallback headline whenever tokensPerSecond is null (delegated A2A turns).
 */
function buildHeadline({tokensPerSecond, durationMillis}) {
    if (typeof tokensPerSecond === 'number') {
        return `${tokensPerSecond.toFixed(1)} tok/s`;
    }

    return formatMillisAsDuration(durationMillis);
}

function buildTooltip({promptTokens, completionTokens, totalTokens, timeToFirstTokenMillis, durationMillis}) {
    return [
        `Prompt tokens: ${formatTokenCount(promptTokens)}`,
        `Completion tokens: ${formatTokenCount(completionTokens)}`,
        `Total tokens: ${formatTokenCount(totalTokens)}`,
        `Time to first token: ${formatMillisAsDuration(timeToFirstTokenMillis)}`,
        `Duration: ${formatMillisAsDuration(durationMillis)}`,
    ].join('\n');
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
        <span className="message-response-metadata" title={buildTooltip(responseMetadata)}>
            {buildHeadline(responseMetadata)}
        </span>
    );
}

export default MessageResponseMetadata;
