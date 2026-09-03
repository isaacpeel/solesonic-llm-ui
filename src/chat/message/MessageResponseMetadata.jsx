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

function calculateTokensPerSecond(promptTokens, totalTokens, promptMillis) {
    if (
        typeof promptTokens !== 'number'
        || typeof totalTokens !== 'number'
        || typeof promptMillis !== 'number'
    ) {
        return null;
    }

    const completionTokens = totalTokens - promptTokens;

    if (completionTokens <= 0 || promptMillis <= 0) {
        return null;
    }

    return completionTokens / (promptMillis / 1000);
}

function buildMetadataText({promptTokens, totalTokens, promptMillis}) {

    const tokensPerSecond = calculateTokensPerSecond(promptTokens, totalTokens, promptMillis);

    const segments = [
        `tok:${formatTokenCount(totalTokens)}`,
    ];

    if (typeof tokensPerSecond === 'number') {
        segments.push(`${tokensPerSecond.toFixed(1)} tok/s`);
    }

    segments.push(`dur:${formatMillisAsDuration(promptMillis)}`);

    return segments.join(' · ');
}

function hasAnyMetadataValue(responseMetadata) {
    const {promptTokens, completionTokens, totalTokens, promptMillis} = responseMetadata;

    return [promptTokens, completionTokens, totalTokens, promptMillis]
        .some((value) => typeof value === 'number');
}

/*
 * Sits beside the model name in .message-actions. Absent entirely on a cancelled turn (the
 * whole responseMetadata object is null there), on a message never sent through the `done`
 * event at all — e.g. one loaded from history before the backend added this field — or when
 * every field on the object came back empty.
 */
function MessageResponseMetadata({responseMetadata}) {
    if (!responseMetadata || !hasAnyMetadataValue(responseMetadata)) {
        return null;
    }

    return (
        <span className="message-response-metadata">
            {buildMetadataText(responseMetadata)}
        </span>
    );
}

export default MessageResponseMetadata;
