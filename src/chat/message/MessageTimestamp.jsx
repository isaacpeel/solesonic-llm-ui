import {parseChatTimestamp} from '../../util/chatHistoryGrouping.js';
import {formatRelativeTime} from '../../util/relativeTime.js';
import './MessageTimestamp.css';

/*
 * Renders nothing without a parseable timestamp, so a message the API stamped differently — or
 * one still streaming — degrades to just the copy button rather than showing "Invalid Date".
 *
 * `nowMilliseconds` is passed in rather than read here: the row is revealed by CSS hover, which
 * does not re-render, so the owner refreshes this on pointer enter to keep the label honest.
 */
function MessageTimestamp({timestamp, nowMilliseconds}) {
    const messageDate = parseChatTimestamp(timestamp);

    if (!messageDate) {
        return null;
    }

    const relativeLabel = formatRelativeTime(messageDate, nowMilliseconds);

    return (
        <time
            className="message-timestamp"
            dateTime={messageDate.toISOString()}
            title={messageDate.toLocaleString()}
        >
            {relativeLabel}
        </time>
    );
}

export default MessageTimestamp;
