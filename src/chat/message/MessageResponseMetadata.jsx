import './MessageResponseMetadata.css';

/*
 * The backend does not send tokensPerSecond directly (see ai-scratch/final-chunk.json:
 * completionTokens + totalMillis only), so it is derived here. `tokensPerSecond` is still read
 * first in case a future response carries it precomputed.
 */
function resolveTokensPerSecond({tokensPerSecond, completionTokens, totalMillis}) {
    if (typeof tokensPerSecond === 'number') {
        return tokensPerSecond;
    }

    if (typeof completionTokens === 'number' && typeof totalMillis === 'number' && totalMillis > 0) {
        return completionTokens / (totalMillis / 1000);
    }

    return null;
}

/*
 * Sits beside the model name in .message-actions. Absent entirely on a cancelled turn (the
 * whole responseMetadata object is null there), on a message never sent through the `done`
 * event at all — e.g. one loaded from history before the backend added this field — or when
 * there isn't enough data to derive a tokens/second figure.
 */
function MessageResponseMetadata({responseMetadata}) {
    if (!responseMetadata) {
        return null;
    }

    const tokensPerSecond = resolveTokensPerSecond(responseMetadata);

    if (tokensPerSecond === null) {
        return null;
    }

    return (
        <span className="message-response-metadata">
            {tokensPerSecond.toFixed(1)} tok/s
        </span>
    );
}

export default MessageResponseMetadata;
