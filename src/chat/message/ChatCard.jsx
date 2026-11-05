import PropTypes from "prop-types";
import {useMemo} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {ExclamationTriangleIcon} from "@heroicons/react/20/solid";
import {buildStreamingMarkdownDisplay} from "../../util/streamingMarkdown.js";
import {renderLatexArrows} from "../../util/latexArrows.js";
import MessageGeneratedImages from "./MessageGeneratedImages.jsx";
import MessageFooter from "./MessageFooter.jsx";
import {USER, AI, SYSTEM, ERROR} from "./ChatMessage.jsx";
import "./ChatMessage.css";

const CITATION_TEXT_PATTERN = /^\[\d+]$/;

const plainText = (children) => {
    if (typeof children === "string" || typeof children === "number") {
        return String(children);
    }

    if (Array.isArray(children)) {
        return children.every((child) => typeof child === "string" || typeof child === "number")
            ? children.join("")
            : null;
    }

    return null;
};

const isCitationText = (children) => CITATION_TEXT_PATTERN.test(plainText(children) ?? "");

const joinClassNames = (...classNames) => classNames.filter(Boolean).join(" ");

function ChatCard({message, children, footer, onExpandImage}) {
    const remarkPlugins = useMemo(() => [remarkGfm, remarkBreaks], []);

    const components = useMemo(() => ({
        a: ({node, className: linkClassName, children: linkChildren, ...props}) => (
            <a
                {...props}
                className={isCitationText(linkChildren) ? joinClassNames(linkClassName, "citation-link") : linkClassName}
                target="_blank"
                rel="noopener noreferrer"
            >
                {linkChildren}
            </a>
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
        [SYSTEM]: {bgColor: '#3b4d61', textColor: '#ffffff'},
        [ERROR]: {bgColor: '#4a2323', textColor: '#ffd9d9'},
    }), []);

    const isElicitation = !!message.elicitationResponse;
    const isError = message.type === ERROR || !!message.isError;
    const isStreaming = !!message.isStreaming;
    const isAIMessage = message.type === AI;
    const notificationLog = Array.isArray(message.notifications) ? message.notifications : [];
    const toolCallList = Array.isArray(message.toolCalls) ? message.toolCalls : [];
    const isAIorSystem = isAIMessage || message.type === SYSTEM;

    const generatedImageList = Array.isArray(message.generatedImages) ? message.generatedImages : [];
    const generatedImageFooter = isAIMessage && generatedImageList.length > 0 ? (
        <MessageGeneratedImages images={generatedImageList} onExpand={onExpandImage}/>
    ) : null;

    const containerType = isElicitation ? SYSTEM : message.type;
    const cardClassName = isElicitation ? `${containerType} elicitation-resolved` : containerType;
    const isInfo = containerType === SYSTEM;
    const colors = containerType === USER || containerType === AI ? null : typeColors[containerType] || typeColors[SYSTEM];

    const text = isElicitation ? '' : message.text;
    const hasText = text && text.trim() !== '';
    const showPlaceholder = isAIorSystem && !hasText && notificationLog.length === 0 && toolCallList.length === 0 && !isElicitation;
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

    const errorHeader = isError ? (
        <div className="message-error-header">
            <ExclamationTriangleIcon className="message-error-icon" aria-hidden="true"/>
            <span>Error</span>
        </div>
    ) : null;

    const card = (
        <div
            className={`message ${cardClassName}`}
            style={colors ? {backgroundColor: colors.bgColor, color: colors.textColor} : undefined}
            role={cardRole}
            aria-label={ariaLabel}
        >
            <div className="message-text">
                {errorHeader}
                {children}
                {displayText && (
                    <div className="markdown-body">
                        <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
                            {displayText}
                        </ReactMarkdown>
                    </div>
                )}
                {!displayText && showPlaceholder && (
                    <div className="message-thinking" role="status">
                        <span className="message-thinking-spinner" aria-hidden="true"/>
                        <span>Thinking</span>
                    </div>
                )}
                {generatedImageFooter}
                {footer}
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
    footer: PropTypes.node,
    onExpandImage: PropTypes.func,
};

export default ChatCard;
