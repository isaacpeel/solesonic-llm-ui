import "./MessageFooter.css";
import MessageResponseMetadata from "./MessageResponseMetadata.jsx";
import MessageCopyButton from "./MessageCopyButton.jsx";

function MessageFooter({message}) {
    return (
        <div className="message-actions">
            <MessageResponseMetadata responseMetadata={message.responseMetadata}/>
            <MessageCopyButton text={message.text}/>
        </div>
    );
}

export default MessageFooter;
