import PropTypes from "prop-types";
import {useMemo} from "react";
import "./ChatMessage.css";
import {InformationCircleIcon} from "@heroicons/react/20/solid";
import ReactMarkdown from "react-markdown";

export const USER = "USER";
export const AI = "ASSISTANT";
export const SYSTEM = "SYSTEM";

function ChatMessage({message}) {
    const isAIorSystem = message.type === AI || message.type === SYSTEM;
    const hasText = message.text && message.text.trim() !== '';
    const showPlaceholder = isAIorSystem && !hasText;

    useMemo(() => {
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
                        // Wrap markdown so we can scope CSS (lists, spacing) without affecting other text
                        <div className="markdown-body">
                            <ReactMarkdown>{message.text || ''}</ReactMarkdown>
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
