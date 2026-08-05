import {useCallback, useEffect, useRef, useState} from 'react';
import log from 'loglevel';
import {CheckIcon, ClipboardDocumentIcon} from '@heroicons/react/20/solid';
import './MessageCopyButton.css';

const COPIED_FEEDBACK_MILLISECONDS = 1600;

/*
 * Copies the message's raw markdown rather than the rendered text. The bubble shows the
 * ReactMarkdown output, but `message.text` is what the model actually produced, so headings,
 * fences and tables survive the round trip into an editor.
 */
function MessageCopyButton({text}) {
    const [hasCopied, setHasCopied] = useState(false);
    const resetTimeoutRef = useRef(null);

    useEffect(() => {
        return () => {
            if (resetTimeoutRef.current) {
                clearTimeout(resetTimeoutRef.current);
            }
        };
    }, []);

    const copyMessage = useCallback(async () => {
        /* Undefined outside a secure context — an http:// deployment on anything but localhost. */
        if (!navigator.clipboard?.writeText) {
            log.error('Clipboard API unavailable; message not copied.');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
        } catch (caughtError) {
            log.error('Failed to copy message to clipboard.', caughtError);
            return;
        }

        setHasCopied(true);

        if (resetTimeoutRef.current) {
            clearTimeout(resetTimeoutRef.current);
        }

        resetTimeoutRef.current = setTimeout(() => setHasCopied(false), COPIED_FEEDBACK_MILLISECONDS);
    }, [text]);

    return (
        <button
            type="button"
            className={`message-copy-button${hasCopied ? ' message-copy-button--copied' : ''}`}
            onClick={copyMessage}
            aria-label={hasCopied ? 'Message copied' : 'Copy message as markdown'}
            title={hasCopied ? 'Copied' : 'Copy as markdown'}
        >
            {hasCopied ? <CheckIcon/> : <ClipboardDocumentIcon/>}
        </button>
    );
}

export default MessageCopyButton;
