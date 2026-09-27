import './MessageResponseMetadata.css';

/*
 * `responseMetadataCalls[0].predictedPerSecond` is the backend's own generation-speed figure
 * (`1000 / predictedPerTokenMillis`) and is preferred when present. `responseMetadata.totalMillis`
 * is not a safe fallback for it — on responses that carry `responseMetadataCalls`, `totalMillis`
 * has been observed to be proxy/overhead time only (e.g. matching
 * liteLlm.responseDurationMillis + overheadDurationMillis), not total generation time. The
 * completionTokens/totalMillis derivation below is kept only for the older response shape that
 * has neither `responseMetadataCalls` nor a precomputed `tokensPerSecond`.
 */
function resolveTokensPerSecond(responseMetadata, responseMetadataCalls) {
    const predictedPerSecond = responseMetadataCalls?.[0]?.predictedPerSecond;

    if (typeof predictedPerSecond === 'number') {
        return predictedPerSecond;
    }

    if (typeof responseMetadata?.tokensPerSecond === 'number') {
        return responseMetadata.tokensPerSecond;
    }

    const {completionTokens, totalMillis} = responseMetadata ?? {};

    if (typeof completionTokens === 'number' && typeof totalMillis === 'number' && totalMillis > 0) {
        return completionTokens / (totalMillis / 1000);
    }

    return null;
}

/* Floors rather than rounds, so the displayed figure never overstates the measured speed. */
function formatTokensPerSecond(tokensPerSecond) {
    return (Math.floor(tokensPerSecond * 10) / 10).toFixed(1);
}

/*
 * Sits beside the model name in .message-actions. Absent entirely on a cancelled turn (the
 * whole responseMetadata object is null there), on a message never sent through the
 * RUN_FINISHED event at all — e.g. one loaded from history before the backend added this field — or when
 * there isn't enough data to derive a tokens/second figure.
 */
function MessageResponseMetadata({responseMetadata, responseMetadataCalls}) {
    const tokensPerSecond = resolveTokensPerSecond(responseMetadata, responseMetadataCalls);

    if (tokensPerSecond === null) {
        return null;
    }

    return (
        <span className="message-response-metadata">
            {formatTokensPerSecond(tokensPerSecond)} tok/s
        </span>
    );
}

export default MessageResponseMetadata;
