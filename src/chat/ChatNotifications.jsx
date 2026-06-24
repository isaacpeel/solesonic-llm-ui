import PropTypes from "prop-types";
import {useState} from "react";Mo

function ChatNotifications({notifications, isStreaming, messageKey}) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (notifications.length === 0) {
        return null;
    }

    return (
        <div className="notification-log" role="status" aria-live="polite">
            {isStreaming ? (
                <div className="notification-log-streaming-row">
                    <span className="notification-log-spinner" aria-hidden="true" />
                    <span className="notification-log-current-step">
                        {notifications[notifications.length - 1]}
                    </span>
                </div>
            ) : (
                <>
                    <button
                        className="notification-log-summary-toggle"
                        onClick={() => setIsExpanded(previousValue => !previousValue)}
                        aria-expanded={isExpanded}
                        aria-controls={`notification-steps-${messageKey}`}
                    >
                        <span className="notification-log-checkmark-icon" aria-hidden="true">✓</span>
                        <span className="notification-log-summary-label">
                            {notifications.length} {notifications.length === 1 ? 'step' : 'steps'} completed
                        </span>
                        <span
                            className={`notification-log-chevron ${isExpanded ? 'notification-log-chevron--expanded' : ''}`}
                            aria-hidden="true"
                        >
                            ▾
                        </span>
                    </button>
                    {isExpanded && (
                        <ul
                            id={`notification-steps-${messageKey}`}
                            className="notification-log-step-list"
                        >
                            {notifications.map((notificationText, notificationIndex) => (
                                <li
                                    key={`${messageKey}-notification-${notificationIndex}`}
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
    );
}

ChatNotifications.propTypes = {
    notifications: PropTypes.arrayOf(PropTypes.string).isRequired,
    isStreaming: PropTypes.bool,
    messageKey: PropTypes.string.isRequired,
};

export default ChatNotifications;
