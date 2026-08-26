import {useState} from "react";
import PropTypes from "prop-types";
import "./ChatMessage.css";
import ChatCard from "./ChatCard.jsx";
import ChatNotifications from "./ChatNotifications.jsx";
import MessageAttachments from "../attachment/MessageAttachments.jsx";
import MessageGeneratedImages from "./MessageGeneratedImages.jsx";
import MessageCopyButton from "./MessageCopyButton.jsx";
import MessageTimestamp from "./MessageTimestamp.jsx";
import MessageResponseMetadata from "./MessageResponseMetadata.jsx";

const POSITIVE_RESPONSE_KEYWORDS = new Set(['accept', 'yes', 'confirm', 'ok', 'approve']);
const NEGATIVE_RESPONSE_KEYWORDS = new Set(['decline', 'no', 'reject', 'deny']);

export const USER = "USER";
export const AI = "ASSISTANT";
export const SYSTEM = "SYSTEM";

const TYPE_COLORS = {
    [USER]: {bgColor: '#e0e0e0', textColor: '#000'},
    [AI]: {bgColor: '#4a4a4a', textColor: '#dedede'},
    [SYSTEM]: {bgColor: '#3b4d61', textColor: '#ffffff'},
};

function ChatMessage({message, onExpandImage}) {
    const [isActionRowRevealed, setIsActionRowRevealed] = useState(false);
    /*
     * The relative label is computed during render, but the row is revealed by CSS hover, which
     * does not re-render — a transcript left open would keep claiming "just now". Re-reading the
     * clock as the pointer arrives refreshes it at exactly the moment it becomes readable.
     */
    const [nowMilliseconds, setNowMilliseconds] = useState(() => Date.now());
    const isElicitation = !!message.elicitationResponse;
    const isAIorSystem = message.type === AI || message.type === SYSTEM;
    const isAIMessage = message.type === AI;
    const hasText = message.text && message.text.trim() !== '';
    const notificationLog = Array.isArray(message.notifications) ? message.notifications : [];
    const showPlaceholder = isAIorSystem && !hasText && notificationLog.length === 0 && !isElicitation;

    const containerClass = isElicitation ? SYSTEM : message.type;
    const modelName = message.responseMetadata?.model || message.model || 'AI Assistant';
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

    /*
     * USER messages only — attachments are not a thing on assistant messages today, and
     * ChatCard renders {children} above the markdown body, so the strip lands above the text
     * with no ChatCard change.
     */
    const attachmentList = Array.isArray(message.attachments) ? message.attachments : [];
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

    const notificationLogChildren = !isElicitation && isAIMessage ? (
        <ChatNotifications
            notifications={notificationLog}
            isStreaming={!!message.isStreaming}
            messageKey={message._key}
        />
    ) : null;

    /*
     * Agentic generation (plan §5 mode 2): the API strips the base64 out of the tool result
     * and attaches a reference to the assistant message, so this renders from an id exactly
     * like the explicit generation panel does. Rendered below the text — the model's sentence
     * introduces the image.
     */
    const generatedImageList = Array.isArray(message.generatedImages) ? message.generatedImages : [];
    const generatedImageFooter = isAIMessage && generatedImageList.length > 0 ? (
        <MessageGeneratedImages images={generatedImageList} onExpand={onExpandImage}/>
    ) : null;

    /*
     * Withheld while the answer streams — a half-written message is not worth copying, and the
     * button would otherwise sit there for the length of the turn with nothing useful behind it.
     * Also withheld from ephemeral messages (the welcome greeting): they are client-side filler
     * with no timestamp and nothing worth copying, and they vanish on the next submit.
     */
    const showCopyButton = isAIMessage && !isElicitation && hasText && !message.isStreaming && !message.ephemeral;

    const revealActionRow = () => {
        setIsActionRowRevealed(true);
        setNowMilliseconds(Date.now());
    };

    const messageCard = (
        <ChatCard
            text={isElicitation ? '' : message.text}
            bgColor={typeColors.bgColor}
            textColor={typeColors.textColor}
            isInfo={isElicitation || message.type === SYSTEM}
            isError={!!message.isError}
            isStreaming={!!message.isStreaming}
            showPlaceholder={showPlaceholder}
            className={cardClassName}
            footer={generatedImageFooter}
        >
            {attachmentChildren}
            {elicitationChildren}
            {notificationLogChildren}
            {visionUnconfirmedChildren}
        </ChatCard>
    );

    return (
        <div className={`chat-message-container ${containerClass}`}>
            {/*
              * The action row needs its own column beneath the card, but .chat-message-container
              * is a row, so the card gets wrapped. Only wrapped when there is an action to show,
              * to leave every other message type's layout untouched.
              *
              * Hover reveals it on a pointer device; a tap does the same where there is no hover
              * to give, which is why the click handler sets a flag rather than leaning on :hover.
              * The pointer leaving clears that flag again, so a click on a mouse-driven browser
              * does not leave the row pinned open behind the cursor.
              */}
            {showCopyButton ? (
                <div
                    className={`message-with-actions${isActionRowRevealed ? ' message-with-actions--revealed' : ''}`}
                    onClick={revealActionRow}
                    onMouseEnter={revealActionRow}
                    onMouseLeave={() => setIsActionRowRevealed(false)}
                >
                    {messageCard}
                    <div className="message-actions">
                        <span className="message-model-name">{modelName}</span>
                        <MessageResponseMetadata responseMetadata={message.responseMetadata}/>
                        <MessageCopyButton text={message.text}/>
                    </div>
                </div>
            ) : messageCard}
        </div>
    );
}

ChatMessage.propTypes = {
    message: PropTypes.object.isRequired,
    onExpandImage: PropTypes.func,
};

export default ChatMessage;
