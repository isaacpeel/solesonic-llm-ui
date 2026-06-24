import PropTypes from "prop-types";
import "./ChatMessage.css";
import {InformationCircleIcon} from "@heroicons/react/20/solid";
import ChatCard from "./ChatCard.jsx";
import ChatNotifications from "./ChatNotifications.jsx";

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

    const notificationLogChildren = !isElicitation && isAIMessage ? (
        <ChatNotifications
            notifications={notificationLog}
            isStreaming={!!message.isStreaming}
            messageKey={message._key}
        />
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
