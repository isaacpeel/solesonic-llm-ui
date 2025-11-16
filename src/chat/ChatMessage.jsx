import PropTypes from "prop-types";
import {useMemo} from "react";
import "./ChatMessage.css";
import {InformationCircleIcon} from "@heroicons/react/20/solid";
import ReactMarkdown from "react-markdown";
import {buildStreamingMarkdownDisplay} from "../utils/streamingMarkdown.js";
import remarkGfm from "remark-gfm";

export const USER = "USER";
export const AI = "ASSISTANT";
export const SYSTEM = "SYSTEM";

function ChatMessage({message}) {
    const isAIorSystem = message.type === AI || message.type === SYSTEM;
    const hasText = message.text && message.text.trim() !== '';
    const showPlaceholder = isAIorSystem && !hasText;

    // During streaming, render a "repaired" markdown string so formatting appears earlier.
    // We never mutate the final stored text; this only affects what is displayed while streaming.
    const displayText = useMemo(() => {
        if (showPlaceholder) {
            return null;
        }

        const rawText = message.text || '';
        const isFinal = !message.isStreaming;
        return buildStreamingMarkdownDisplay(rawText, { isFinal });
    }, [message.text, message.isStreaming, showPlaceholder]);

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
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText || ''}</ReactMarkdown>
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
