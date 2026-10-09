import './MessageResponseMetadata.css';

const UNAVAILABLE_TOKENS_PER_SECOND = '--/--';

/* Floors rather than rounds, so the displayed figure never overstates the measured speed. */
function formatTokensPerSecond(tokensPerSecond) {
    return (Math.floor(tokensPerSecond * 10) / 10).toFixed(1);
}

/*
 * Shows the API's responseMetadata.tokensPerSecond as reported; the UI never derives a rate.
 * When the API reported none (cancelled turns, non-LiteLLM turns, older history) a placeholder is shown.
 */
function MessageResponseMetadata({responseMetadata}) {
    const tokensPerSecond = responseMetadata?.tokensPerSecond;
    const displayedTokensPerSecond = Number.isFinite(tokensPerSecond)
        ? formatTokensPerSecond(tokensPerSecond)
        : UNAVAILABLE_TOKENS_PER_SECOND;

    return (
        <span className="message-response-metadata">
            {displayedTokensPerSecond} tok/s
        </span>
    );
}

export default MessageResponseMetadata;
