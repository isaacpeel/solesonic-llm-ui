import Linkify from 'linkify-react';

const linkifyOptions = {
    target: "blank_",
    className: "jira-issue-link"
};

const parseMarkdown = (text) => {
    if (!text) {
        return [];
    }

    const lines = text.split('\n');
    const elements = [];
    let inCodeBlock = false;
    let codeBlockContent = [];
    let codeBlockLanguage = '';

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];

        // Handle code blocks
        if (line.trim().startsWith('```')) {
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeBlockLanguage = line.trim().substring(3).trim();
                codeBlockContent = [];
            } else {
                inCodeBlock = false;
                elements.push({
                    type: 'codeBlock',
                    content: codeBlockContent.join('\n'),
                    language: codeBlockLanguage,
                    key: `code-${lineIndex}`
                });
                codeBlockContent = [];
                codeBlockLanguage = '';
            }
            continue;
        }

        if (inCodeBlock) {
            codeBlockContent.push(line);
            continue;
        }

        // Handle headings
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            elements.push({
                type: 'heading',
                level: headingMatch[1].length,
                content: headingMatch[2],
                key: `h-${lineIndex}`
            });
            continue;
        }

        // Handle unordered lists
        const ulMatch = line.match(/^[\s]*[-*+]\s+(.+)$/);
        if (ulMatch) {
            elements.push({
                type: 'listItem',
                ordered: false,
                content: ulMatch[1],
                key: `li-${lineIndex}`
            });
            continue;
        }

        // Handle ordered lists
        const olMatch = line.match(/^[\s]*(\d+)\.\s+(.+)$/);
        if (olMatch) {
            elements.push({
                type: 'listItem',
                ordered: true,
                content: olMatch[2],
                key: `li-${lineIndex}`
            });
            continue;
        }

        // Regular paragraph
        if (line.trim() === '') {
            elements.push({
                type: 'break',
                key: `br-${lineIndex}`
            });
        } else {
            elements.push({
                type: 'paragraph',
                content: line,
                key: `p-${lineIndex}`
            });
        }
    }

    // Handle unclosed code block
    if (inCodeBlock && codeBlockContent.length > 0) {
        elements.push({
            type: 'codeBlock',
            content: codeBlockContent.join('\n'),
            language: codeBlockLanguage,
            key: `code-end`
        });
    }

    return elements;
};

const parseInlineFormatting = (text) => {
    // Split text by inline code
    const parts = [];
    let currentText = text;
    let keyCounter = 0;

    // Handle inline code first (backticks)
    const codeRegex = /`([^`]+)`/g;
    let lastIndex = 0;
    let match;

    while ((match = codeRegex.exec(currentText)) !== null) {
        if (match.index > lastIndex) {
            const beforeCode = currentText.substring(lastIndex, match.index);
            parts.push({ type: 'text', content: beforeCode, key: `txt-${keyCounter++}` });
        }
        parts.push({ type: 'inlineCode', content: match[1], key: `ic-${keyCounter++}` });
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < currentText.length) {
        parts.push({ type: 'text', content: currentText.substring(lastIndex), key: `txt-${keyCounter++}` });
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: text, key: 'txt-0' }];
};

const formatInlineText = (text) => {
    // Process bold, italic
    let result = text;
    const elements = [];
    let currentIndex = 0;
    let elementKey = 0;

    // Simple regex for **bold** and *italic*
    const boldRegex = /\*\*(.+?)\*\*/g;
    const italicRegex = /\*(.+?)\*/g;

    // Replace bold with markers
    result = result.replace(boldRegex, (match, content) => {
        return `<BOLD_${elementKey++}>${content}</BOLD>`;
    });

    // Replace italic with markers
    result = result.replace(italicRegex, (match, content) => {
        return `<ITALIC_${elementKey++}>${content}</ITALIC>`;
    });

    // Parse markers and create spans
    const parts = [];
    const markerRegex = /<(BOLD|ITALIC)_(\d+)>(.+?)<\/\1>/g;
    let lastIdx = 0;
    let markerMatch;

    while ((markerMatch = markerRegex.exec(result)) !== null) {
        if (markerMatch.index > lastIdx) {
            parts.push(result.substring(lastIdx, markerMatch.index));
        }

        const type = markerMatch[1].toLowerCase();
        const content = markerMatch[3];

        if (type === 'bold') {
            parts.push(<strong key={`strong-${markerMatch[2]}`}>{content}</strong>);
        } else if (type === 'italic') {
            parts.push(<em key={`em-${markerMatch[2]}`}>{content}</em>);
        }

        lastIdx = markerMatch.index + markerMatch[0].length;
    }

    if (lastIdx < result.length) {
        parts.push(result.substring(lastIdx));
    }

    return parts.length > 0 ? parts : text;
};

const renderInlineContent = (content) => {
    const parts = parseInlineFormatting(content);

    return parts.map((part) => {
        if (part.type === 'inlineCode') {
            return (
                <code key={part.key} className="inline-code">
                    {part.content}
                </code>
            );
        }

        // Apply bold/italic formatting to regular text
        const formatted = formatInlineText(part.content);
        return (
            <Linkify key={part.key} as="span" options={linkifyOptions}>
                {formatted}
            </Linkify>
        );
    });
};

export const formatMessage = (text) => {
    if (!text || text.trim() === '') {
        return null;
    }

    const elements = parseMarkdown(text);

    return (
        <div className="formatted-message">
            {elements.map((element) => {
                switch (element.type) {
                    case 'heading':
                        const HeadingTag = `h${element.level}`;
                        return (
                            <HeadingTag key={element.key} className="message-heading">
                                {renderInlineContent(element.content)}
                            </HeadingTag>
                        );

                    case 'codeBlock':
                        return (
                            <pre key={element.key} className="code-block">
                                <code className={element.language ? `language-${element.language}` : ''}>
                                    {element.content}
                                </code>
                            </pre>
                        );

                    case 'listItem':
                        const ListTag = element.ordered ? 'ol' : 'ul';
                        return (
                            <ListTag key={element.key} className="message-list">
                                <li>{renderInlineContent(element.content)}</li>
                            </ListTag>
                        );

                    case 'break':
                        return <br key={element.key} />;

                    case 'paragraph':
                    default:
                        return (
                            <div key={element.key} className="message-paragraph">
                                {renderInlineContent(element.content)}
                            </div>
                        );
                }
            })}
        </div>
    );
};
