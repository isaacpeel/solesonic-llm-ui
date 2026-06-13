import PropTypes from "prop-types";
import {useMemo} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {buildStreamingMarkdownDisplay} from "../util/streamingMarkdown.js";
import "./ChatMessage.css";

function ChatCard({text, bgColor, textColor, isError, isInfo, isStreaming, showPlaceholder, className, children}) {
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
        table: ({node, ...props}) => <table {...props} />,
        thead: ({node, ...props}) => <thead {...props} />,
        tbody: ({node, ...props}) => <tbody {...props} />,
        tr: ({node, ...props}) => <tr {...props} />,
        th: ({node, ...props}) => <th {...props} />,
        td: ({node, ...props}) => <td {...props} />,
    }), []);

    const hasText = text && text.trim() !== '';

    const displayText = useMemo(() => {
        if (!hasText) {
            return null;
        }
        const rawText = text.trimEnd();
        const isFinal = !isStreaming;
        return buildStreamingMarkdownDisplay(rawText, {isFinal});
    }, [text, isStreaming, hasText]);

    const cardRole = isError ? 'alert' : isInfo ? 'status' : undefined;
    const ariaLabel = isError ? 'Error message' : isInfo ? 'Information message' : undefined;

    return (
        <div
            className={`message${className ? ` ${className}` : ''}`}
            style={{backgroundColor: bgColor, color: textColor}}
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
            </div>
        </div>
    );
}

ChatCard.propTypes = {
    text: PropTypes.string,
    bgColor: PropTypes.string,
    textColor: PropTypes.string,
    isError: PropTypes.bool,
    isInfo: PropTypes.bool,
    isStreaming: PropTypes.bool,
    showPlaceholder: PropTypes.bool,
    className: PropTypes.string,
    children: PropTypes.node,
};

ChatCard.defaultProps = {
    isError: false,
    isInfo: false,
    isStreaming: false,
    showPlaceholder: false,
};

export default ChatCard;
