import "./MessageFooter.css";
import MessageResponseMetadata from "./MessageResponseMetadata.jsx";
import MessageCopyButton from "./MessageCopyButton.jsx";
import {AI} from "./ChatMessage.jsx";

function shouldShowMessageFooter(message) {
    const hasText = message.text && message.text.trim() !== '';

    return message.type === AI && !message.elicitationResponse && hasText && !message.isStreaming && !message.ephemeral;
}

function MessageFooter({message, children}) {
    if (!shouldShowMessageFooter(message)) {
        return children;
    }

    const modelName = message.model
        || message.responseMetadata?.routedModel
        || message.responseMetadata?.model
        || 'AI Assistant';

    return (
        <div className="message-with-actions">
            {children}
            <div className="message-actions">
                <span className="message-model-name">{modelName}</span>
                <MessageResponseMetadata
                    responseMetadata={message.responseMetadata}
                    responseMetadataCalls={message.responseMetadataCalls}
                />
                <MessageCopyButton text={message.text}/>
            </div>
        </div>
    );
}

export default MessageFooter;
