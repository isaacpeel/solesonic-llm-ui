import "./ChatSearchResultLabel.css";
import {splitHighlight, splitLabelHighlight} from "../../util/chatHistorySearch.js";

function HighlightedText({className, parts}) {
    return (
        <span className={className}>
            {parts.before}
            {parts.match !== "" && <mark className="chat-search-highlight">{parts.match}</mark>}
            {parts.after}
        </span>
    );
}

/*
 * A result row's content: the label, and the matching message's snippet under it. With no `match`
 * only the name matched, so the label carries the highlight and there is no second line.
 */
function ChatSearchResultLabel({label, match, query}) {
    if (!match) {
        return (
            <span className="chat-search-result">
                <HighlightedText className="chat-search-result-label" parts={splitLabelHighlight(label, query)}/>
            </span>
        );
    }

    return (
        <span className="chat-search-result">
            <span className="chat-search-result-label">{label}</span>
            <HighlightedText
                className="chat-search-result-snippet"
                parts={splitHighlight(match.snippet, match.highlightStart, match.highlightLength)}
            />
        </span>
    );
}

export default ChatSearchResultLabel;
