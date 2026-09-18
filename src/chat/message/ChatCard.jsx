import PropTypes from "prop-types";
import {useMemo} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {buildStreamingMarkdownDisplay} from "../../util/streamingMarkdown.js";
import {renderLatexArrows} from "../../util/latexArrows.js";
import MessageGeneratedImages from "./MessageGeneratedImages.jsx";
import MessageFooter from "./MessageFooter.jsx";
import {USER, AI, SYSTEM} from "./ChatMessage.jsx";
import "./ChatMessage.css";

function ChatCard({message, children, onExpandImage}) {
    const remarkPlugins = useMemo(() => [remarkGfm, remarkBreaks], []);

    const components = useMemo(() => ({
        a: ({node, ...props}) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
        ),
        pre: ({node, ...props}) => (
            <div className="code-block" {...props} />
        ),
        code: ({node, className: codeClassName, children: codeChildren, ...props}) => (
            <code className={codeClassName} {...props}>{codeChildren}</code>
        ),
        table: ({node, ...props}) => (
            <div className="table-scroll-wrapper">
                <table {...props} />
            </div>
        ),
        thead: ({node, ...props}) => <thead {...props} />,
        tbody: ({node, ...props}) => <tbody {...props} />,
        tr: ({node, ...props}) => <tr {...props} />,
        th: ({node, ...props}) => <th {...props} />,
        td: ({node, ...props}) => <td {...props} />,
    }), []);

    const typeColors = useMemo(() => ({
        [USER]: {bgColor: '#e0e0e0', textColor: '#000'},
        [AI]: {bgColor: '#4a4a4a', textColor: '#dedede'},
        [SYSTEM]: {bgColor: '#3b4d61', textColor: '#ffffff'},
    }), []);

    const isElicitation = !!message.elicitationResponse;
    const isError = !!message.isError;
    const isStreaming = !!message.isStreaming;
    const isAIMessage = message.type === AI;
    const notificationLog = Array.isArray(message.notifications) ? message.notifications : [];
    const isAIorSystem = isAIMessage || message.type === SYSTEM;

    const generatedImageList = Array.isArray(message.generatedImages) ? message.generatedImages : [];
    const generatedImageFooter = isAIMessage && generatedImageList.length > 0 ? (
        <MessageGeneratedImages images={generatedImageList} onExpand={onExpandImage}/>
    ) : null;

    const containerType = isElicitation ? SYSTEM : message.type;
    const cardClassName = isElicitation ? `${containerType} elicitation-resolved` : containerType;
    const isInfo = containerType === SYSTEM;
    const colors = typeColors[containerType] || typeColors[SYSTEM];

    const text = isElicitation ? '' : message.text;
    const hasText = text && text.trim() !== '';
    const showPlaceholder = isAIorSystem && !hasText && notificationLog.length === 0 && !isElicitation;
    const showMessageFooter = isAIMessage && !isElicitation && hasText && !isStreaming && !message.ephemeral;

    const displayText = useMemo(() => {
        if (!hasText) {
            return null;
        }
        const rawText = renderLatexArrows(text.trimEnd());
        const isFinal = !isStreaming;
        return buildStreamingMarkdownDisplay(rawText, {isFinal});
    }, [text, isStreaming, hasText]);

    const cardRole = isError ? 'alert' : isInfo ? 'status' : undefined;
    const ariaLabel = isError ? 'Error message' : isInfo ? 'Information message' : undefined;

    const card = (
        <div
            className={`message ${cardClassName}`}
            style={{backgroundColor: colors.bgColor, color: colors.textColor}}
            role={cardRole}
            aria-label={ariaLabel}
        >
            <div className="message-text">
                {children}
                {(displayText || showPlaceholder) && (
                    <div className="markdown-body">
                        <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
                            {displayText || 'Thinking...'}
                        </ReactMarkdown>
                    </div>
                )}
                {generatedImageFooter}
            </div>
        </div>
    );

    if (!showMessageFooter) {
        return card;
    }

    return (
        <div className="message-with-actions">
            {card}
            <MessageFooter message={message}/>
        </div>
    );
}

ChatCard.propTypes = {
    message: PropTypes.object.isRequired,
    children: PropTypes.node,
    onExpandImage: PropTypes.func,
};

export default ChatCard;
