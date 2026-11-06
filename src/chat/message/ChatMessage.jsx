import "./ChatMessage.css";
import ChatCard from "./ChatCard.jsx";
import ChatNotifications from "./ChatNotifications.jsx";
import MessageAttachments from "../attachment/MessageAttachments.jsx";
import UserMessageCommandBadge from "../command/UserMessageCommandBadge.jsx";
import AnalyzeErrorButton from "./AnalyzeErrorButton.jsx";
import MessageHeader from "./MessageHeader.jsx";
import ToolActivity from "../activity/ToolActivity.jsx";
import {ASSISTANT_NAME, modelNameOf} from "./messageIdentity.js";
import {canAnalyze} from "../../util/analyzeRequest.js";

const POSITIVE_RESPONSE_KEYWORDS = new Set(['accept', 'yes', 'confirm', 'ok', 'approve']);
const NEGATIVE_RESPONSE_KEYWORDS = new Set(['decline', 'no', 'reject', 'deny']);

export const USER = "USER";
export const AI = "ASSISTANT";
export const SYSTEM = "SYSTEM";
export const ERROR = "ERROR";

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function ChatMessage({message, senderLabel, assistantLabel, onExpandImage, onAnalyzeError, analyzeBusy = false}) {
    const isElicitation = !!message.elicitationResponse;
    const isAIMessage = message.type === AI;
    const isStreaming = !!message.isStreaming;
    const notificationLog = toArray(message.notifications);

    const containerClass = isElicitation ? SYSTEM : message.type;

    const elicitationChildren = isElicitation ? (() => {
        const responseText = message.elicitationResponse;
        const responseLower = responseText.toLowerCase();
        const badgeModifier = POSITIVE_RESPONSE_KEYWORDS.has(responseLower)
            ? 'elicitation-resolved-badge--positive'
            : NEGATIVE_RESPONSE_KEYWORDS.has(responseLower)
                ? 'elicitation-resolved-badge--negative'
                : 'elicitation-resolved-badge--neutral';
        const displayResponse = responseText.charAt(0).toUpperCase() + responseText.slice(1);

        return (
            <>
                <span className="elicitation-resolved-question">{message.text}</span>
                <span className={`elicitation-resolved-badge ${badgeModifier}`}>
                    ✓ {displayResponse}
                </span>
            </>
        );
    })() : null;

    const commandList = toArray(message.commands);
    const commandBadgeChildren = message.type === USER && commandList.length > 0 ? (
        <UserMessageCommandBadge command={commandList[0]}/>
    ) : null;

    /*
     * USER messages only — attachments are not a thing on assistant messages today, and
     * ChatCard renders {children} above the markdown body, so the strip lands above the text
     * with no ChatCard change.
     */
    const attachmentList = toArray(message.attachments);
    const attachmentChildren = message.type === USER && attachmentList.length > 0 ? (
        <MessageAttachments attachments={attachmentList} onExpand={onExpandImage}/>
    ) : null;

    /*
     * The backend cannot tell us a vision pass failed (see
     * ai-scratch/chat-attachment-vision-signal-request.md), so this stands in: the turn ended
     * without the backend ever reporting that it read the images.
     */
    const visionUnconfirmedChildren = isAIMessage && message.visionStepUnconfirmed ? (
        <div className="message-vision-unconfirmed" role="status">
            The assistant may not have been able to read the attached image.
        </div>
    ) : null;

    const toolActivityChildren = !isElicitation && isAIMessage ? (
        <ToolActivity toolCalls={message.toolCalls} streaming={isStreaming}/>
    ) : null;

    const notificationLogChildren = !isElicitation && isAIMessage ? (
        <ChatNotifications
            notifications={notificationLog}
            isStreaming={isStreaming}
            messageKey={message._key}
        />
    ) : null;

    const analyzeChildren = message.type === ERROR && onAnalyzeError && canAnalyze(message) ? (
        <AnalyzeErrorButton onAnalyze={() => onAnalyzeError(message)} busy={analyzeBusy}/>
    ) : null;

    const header = isElicitation || (message.type !== USER && !isAIMessage) ? null : (
        <MessageHeader
            name={message.type === USER ? senderLabel || 'You' : assistantLabel || ASSISTANT_NAME}
            model={isAIMessage ? modelNameOf(message) : null}
            timestamp={isStreaming ? null : message.timestamp}
        />
    );

    return (
        <div className={`chat-message-container ${containerClass}`}>
            {header}
            <ChatCard message={message} onExpandImage={onExpandImage} footer={analyzeChildren}>
                {commandBadgeChildren}
                {attachmentChildren}
                {elicitationChildren}
                {toolActivityChildren}
                {notificationLogChildren}
                {visionUnconfirmedChildren}
            </ChatCard>
        </div>
    );
}

export default ChatMessage;
