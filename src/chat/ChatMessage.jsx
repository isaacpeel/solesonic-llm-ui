import PropTypes from "prop-types";
import {useState} from "react";
import "./ChatMessage.css";
import {InformationCircleIcon} from "@heroicons/react/20/solid";
import ChatCard from "./ChatCard.jsx";

const POSITIVE_RESPONSE_KEYWORDS = new Set(['accept', 'yes', 'confirm', 'ok', 'approve']);
const NEGATIVE_RESPONSE_KEYWORDS = new Set(['decline', 'no', 'reject', 'deny']);

export const USER = "USER";
export const AI = "ASSISTANT";
export const SYSTEM = "SYSTEM";

const TYPE_COLORS = {
    [USER]:   {bgColor: '#e0e0e0', textColor: '#000'},
    [AI]:     {bgColor: '#4a4a4a', textColor: '#dedede'},
    [SYSTEM]: {bgColor: '#3b4d61', textColor: '#ffffff'},
};

function ChatMessage({message}) {
    const isElicitation = !!message.elicitationResponse;
    const isAIorSystem = message.type === AI || message.type === SYSTEM;
    const isAIMessage = message.type === AI;
    const hasText = message.text && message.text.trim() !== '';
    const notificationLog = Array.isArray(message.notifications) ? message.notifications : [];
    const showPlaceholder = isAIorSystem && !hasText && notificationLog.length === 0 && !isElicitation;
    const [isNotificationLogExpanded, setIsNotificationLogExpanded] = useState(false);

    const containerClass = isElicitation ? SYSTEM : message.type;
    const showIcon = isElicitation || isAIorSystem;
    const iconLabel = isElicitation ? 'AI Assistant' : (message.model || 'AI Assistant');
    const cardClassName = isElicitation ? 'SYSTEM elicitation-resolved' : message.type;
    const typeColors = isElicitation ? TYPE_COLORS[SYSTEM] : (TYPE_COLORS[message.type] || TYPE_COLORS[SYSTEM]);

    const elicitationChildren = isElicitation ? (() => {
        const responseText = message.elicitationResponse;
        const responseLower = responseText.toLowerCase();
        const badgeModifier = POSITIVE_RESPONSE_KEYWORDS.has(responseLower)
            ? 'elicitation-resolved-badge--positive'
            : NEGATIVE_RESPONSE_KEYWORDS.has(responseLower)
                ? 'elicitation-resolved-badge--negative'
                : 'elicitation-resolved-badge--neutral';
        const displayResponse = responseText.charAt(0).toUpperCase() + responseText.slice(1).toLowerCase();

        return (
            <>
                <span className="elicitation-resolved-question">{message.text}</span>
                <span className={`elicitation-resolved-badge ${badgeModifier}`}>
                    ✓ {displayResponse}
                </span>
            </>
        );
    })() : null;

    const notificationLogChildren = !isElicitation && isAIMessage && notificationLog.length > 0 ? (
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
    ) : null;

    return (
        <div className={`chat-message-container ${containerClass}`}>
            {showIcon && (
                <div className="info-icon-wrapper" data-dialog={iconLabel}>
                    <InformationCircleIcon />
                </div>
            )}
            <ChatCard
                text={isElicitation ? '' : message.text}
                bgColor={typeColors.bgColor}
                textColor={typeColors.textColor}
                isInfo={isElicitation || message.type === SYSTEM}
                isError={!!message.isError}
                isStreaming={!!message.isStreaming}
                showPlaceholder={showPlaceholder}
                className={cardClassName}
            >
                {elicitationChildren}
                {notificationLogChildren}
            </ChatCard>
        </div>
    );
}

ChatMessage.propTypes = {
    message: PropTypes.object.isRequired,
};

export default ChatMessage;
