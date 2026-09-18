import "./MessageFooter.css";
import MessageResponseMetadata from "./MessageResponseMetadata.jsx";
import MessageCopyButton from "./MessageCopyButton.jsx";

function MessageFooter({message}) {
    const modelName = message.model
        || message.responseMetadata?.routedModel
        || message.responseMetadata?.model
        || 'AI Assistant';

    return (
        <div className="message-actions">
            <span className="message-model-name">{modelName}</span>
            <MessageResponseMetadata
                responseMetadata={message.responseMetadata}
                responseMetadataCalls={message.responseMetadataCalls}
            />
            <MessageCopyButton text={message.text}/>
        </div>
    );
}

export default MessageFooter;
