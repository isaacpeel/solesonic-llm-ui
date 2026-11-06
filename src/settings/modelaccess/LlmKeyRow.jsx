import {formatRelativeTime} from "../../util/relativeTime.js";
import "./LlmKeyRow.css";

const describeUpdate = (summary, currentUserId) => {
    const parts = ["Updated"];
    const updatedLabel = summary.updated ? formatRelativeTime(new Date(summary.updated)) : null;

    if (updatedLabel) {
        parts.push(updatedLabel);
    }

    if (summary.updatedBy) {
        parts.push("by", summary.updatedBy === currentUserId ? "you" : summary.updatedBy);
    }

    return parts.join(" ");
};

const LlmKeyRow = ({summary, currentUserId, actionsDisabled, onReplace, onRemove}) => {
    const copyUserId = () => {
        navigator.clipboard?.writeText(summary.userId)?.catch(() => {});
    };

    return (
        <li className="llm-key-row">
            <div className="llm-key-row-details">
                <div className="llm-key-row-identity">
                    {summary.username ? (
                        <span className="llm-key-row-name">{summary.username}</span>
                    ) : (
                        <>
                            <span className="llm-key-row-name llm-key-row-name-id">{summary.userId}</span>
                            <button
                                type="button"
                                className="llm-key-row-copy"
                                aria-label="Copy user id"
                                onClick={copyUserId}
                            >
                                Copy
                            </button>
                        </>
                    )}
                </div>

                <span className="llm-key-row-hint">{`•••• ${summary.keyHint}`}</span>
                <span className="llm-key-row-updated">{describeUpdate(summary, currentUserId)}</span>
            </div>

            <div className="llm-key-row-actions">
                <button type="button" className="llm-key-row-button" disabled={actionsDisabled} onClick={onReplace}>
                    Replace key
                </button>
                <button
                    type="button"
                    className="llm-key-row-button llm-key-row-button-danger"
                    disabled={actionsDisabled}
                    onClick={onRemove}
                >
                    Remove access
                </button>
            </div>
        </li>
    );
};

export default LlmKeyRow;
