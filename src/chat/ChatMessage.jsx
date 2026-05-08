import PropTypes from "prop-types";
import {useState, useMemo} from "react";
import "./ChatMessage.css";
import {InformationCircleIcon} from "@heroicons/react/20/solid";

const POSITIVE_RESPONSE_KEYWORDS = new Set(['accept', 'yes', 'confirm', 'ok', 'approve']);
const NEGATIVE_RESPONSE_KEYWORDS = new Set(['decline', 'no', 'reject', 'deny']);
import ReactMarkdown from "react-markdown";
import {buildStreamingMarkdownDisplay} from "../utils/streamingMarkdown.js";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

export const USER = "USER";
export const AI = "ASSISTANT";
export const SYSTEM = "SYSTEM";

function ChatMessage({message}) {
    const isAIorSystem = message.type === AI || message.type === SYSTEM;
    const isAIMessage = message.type === AI;
    const hasText = message.text && message.text.trim() !== '';
    const showPlaceholder = isAIorSystem && !hasText;
    const notificationLog = Array.isArray(message.notifications) ? message.notifications : [];
    const [isNotificationLogExpanded, setIsNotificationLogExpanded] = useState(false);

    const remarkPlugins = useMemo(() => [remarkGfm, remarkBreaks], []);


    const components = useMemo(() => ({
        a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
        ),
        // Override 'pre' to serve as the container for code blocks
        pre: ({node, ...props}) => (
            <div className="code-block" {...props} />
        ),
        // Simplify 'code': let CSS handle the difference between inline and block
        code: ({node, className, children, ...props}) => {
            return <code className={className} {...props}>{children}</code>;
        },
        table: ({node, ...props}) => <table {...props} />,
        thead: ({node, ...props}) => <thead {...props} />,
        tbody: ({node, ...props}) => <tbody {...props} />,
        tr: ({node, ...props}) => <tr {...props} />,
        th: ({node, ...props}) => <th {...props} />,
        td: ({node, ...props}) => <td {...props} />,
    }), []);

    // During streaming, render a "repaired" markdown string so formatting appears earlier.
    // We never mutate the final stored text; this only affects what is displayed while streaming.
    const displayText = useMemo(() => {
        if (showPlaceholder) {
            return null;
        }

        const rawText = (message.text || '').trimEnd();
        const isFinal = !message.isStreaming;
        return buildStreamingMarkdownDisplay(rawText, { isFinal });
    }, [message.text, message.isStreaming, showPlaceholder]);

    if (message.elicitationResponse) {
        const responseText = message.elicitationResponse;
        const responseLower = responseText.toLowerCase();
        const badgeModifier = POSITIVE_RESPONSE_KEYWORDS.has(responseLower)
            ? 'elicitation-resolved-badge--positive'
            : NEGATIVE_RESPONSE_KEYWORDS.has(responseLower)
                ? 'elicitation-resolved-badge--negative'
                : 'elicitation-resolved-badge--neutral';
        const displayResponse = responseText.charAt(0).toUpperCase() + responseText.slice(1).toLowerCase();

        return (
            <div className="chat-message-container SYSTEM">
                <div className="info-icon-wrapper" data-dialog="AI Assistant">
                    <InformationCircleIcon />
                </div>
                <div className="message SYSTEM elicitation-resolved">
                    <span className="elicitation-resolved-question">{message.text}</span>
                    <span className={`elicitation-resolved-badge ${badgeModifier}`}>
                        ✓ {displayResponse}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className={`chat-message-container ${message.type}`}>
            {isAIorSystem && (
                <div
                    className="info-icon-wrapper"
                    data-dialog={message.model || 'AI Assistant'}
                >
                    <InformationCircleIcon />
                </div>
            )}
            <div className={`message ${message.type}`}>
                <div className="message-text">
                    {isAIMessage && notificationLog.length > 0 && (
                        <div className="notification-log" role="status" aria-live="polite">
                            {message.isStreaming ? (
                                <div className="notification-log-streaming-row">
                                    <span className="notification-log-spinner" aria-hidden="true" />
                                    <span className="notification-log-current-step">
                                        {notificationLog[notificationLog.length - 1]}
                                    </span>
                                </div>
                            ) : (
                                <>
                                    <button
                                        className="notification-log-summary-toggle"
                                        onClick={() => setIsNotificationLogExpanded(previousValue => !previousValue)}
                                        aria-expanded={isNotificationLogExpanded}
                                        aria-controls={`notification-steps-${message._key}`}
                                    >
                                        <span className="notification-log-checkmark-icon" aria-hidden="true">✓</span>
                                        <span className="notification-log-summary-label">
                                            {notificationLog.length} {notificationLog.length === 1 ? 'step' : 'steps'} completed
                                        </span>
                                        <span
                                            className={`notification-log-chevron ${isNotificationLogExpanded ? 'notification-log-chevron--expanded' : ''}`}
                                            aria-hidden="true"
                                        >
                                            ▾
                                        </span>
                                    </button>
                                    {isNotificationLogExpanded && (
                                        <ul
                                            id={`notification-steps-${message._key}`}
                                            className="notification-log-step-list"
                                        >
                                            {notificationLog.map((notificationText, notificationIndex) => (
                                                <li
                                                    key={`${message._key}-notification-${notificationIndex}`}
                                                    className="notification-log-step-item"
                                                >
                                                    <span className="notification-log-step-checkmark" aria-hidden="true">✓</span>
                                                    {notificationText}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {showPlaceholder ? (
                        <span className="message-placeholder">Thinking...</span>
                    ) : (
                        // Wrap Markdown so we can scope CSS (lists, spacing) without affecting other text
                        <div className="markdown-body">
                            <ReactMarkdown
                                remarkPlugins={remarkPlugins}
                                components={components}
                            >
                                {displayText || ''}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

ChatMessage.propTypes = {
    message: PropTypes.object.isRequired,
};

export default ChatMessage;
