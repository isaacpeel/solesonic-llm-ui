import PropTypes from "prop-types";
import {useMemo} from "react";
import "./ChatMessage.css";
import {InformationCircleIcon} from "@heroicons/react/20/solid";
import {formatMessage} from "../util/formatMessage.jsx";

export const USER = "USER";
export const AI = "ASSISTANT";
export const SYSTEM = "SYSTEM";

function ChatMessage({message}) {
    const isAIorSystem = message.type === AI || message.type === SYSTEM;
    const hasText = message.text && message.text.trim() !== '';
    const showPlaceholder = isAIorSystem && !hasText;

    const formattedContent = useMemo(() => {
        if (!showPlaceholder) {
            return message.text || '';
        }
        return null;
    }, [message.text, showPlaceholder]);

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
                    {showPlaceholder ? (
                        <span className="message-placeholder">Thinking...</span>
                    ) : (
                        message.formattedText || message.text
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
