import MessageTimestamp from './MessageTimestamp.jsx';
import './MessageHeader.css';

function MessageHeader({name, model, timestamp}) {
    return (
        <div className="message-header">
            <span className="message-sender">{name}</span>
            {model && <span className="message-model-name">{model}</span>}
            <MessageTimestamp timestamp={timestamp}/>
        </div>
    );
}

export default MessageHeader;
