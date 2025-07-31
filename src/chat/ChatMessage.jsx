import PropTypes from "prop-types";
import "./ChatMessage.css";
import {InformationCircleIcon} from "@heroicons/react/20/solid";
import {toJsx} from "../util/htmlFunctions.jsx"


export const USER = "USER";
export const AI = "ASSISTANT";
export const SYSTEM = "SYSTEM";

function ChatMessage({message}) {
    return (
        <div className={`chat-message-container ${message.type}`}>
            {(message.type === AI || message.type === SYSTEM) && message.model && (
                <div
                    className="info-icon-wrapper"
                    data-dialog={message.model}
                >
                    <InformationCircleIcon />
                </div>
            )}
            <div className={`message ${message.type}`}>
                <div className="message-text">
                    {toJsx(message.text)}
                </div>
            </div>
        </div>
    );
}

ChatMessage.propTypes = {
    message: PropTypes.object.isRequired,
};

export default ChatMessage;
