import {useEffect} from 'react';
import {ArrowUpIcon, StopIcon} from '@heroicons/react/20/solid';
import useIsMobile from '../../hooks/useIsMobile.js';
import './MessageComposer.css';

const renderPlainRow = (row) => <div className="chat-input-row">{row}</div>;

function MessageComposer({
    inputRef,
    inputValue,
    onInputChange,
    onSubmit,
    canSubmit,
    disabled = false,
    placeholder,
    ariaLabel,
    loading = false,
    onStop = null,
    showSend = true,
    focusSuppressed = false,
    onKeyDown,
    onPaste,
    popovers = null,
    renderRow = renderPlainRow,
    containerRef,
}) {
    const isMobile = useIsMobile();

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = "auto";
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }

        if (inputRef.current && !focusSuppressed) {
            inputRef.current.focus();
        }
    }, [inputRef, inputValue, focusSuppressed]);

    const submitMessage = () => {
        if (!canSubmit) {
            return;
        }

        onSubmit().then((submitted) => {
            if (submitted && inputRef.current) {
                inputRef.current.style.height = "auto";
            }
        });
    };

    const handleKeyDown = (event) => {
        if (onKeyDown?.(event)) {
            return;
        }

        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) {
            return;
        }

        /* On touch devices Enter has no Shift companion, so it inserts a newline; the send button submits. */
        if (isMobile) {
            return;
        }

        event.preventDefault();
        submitMessage();
    };

    return (
        <div className="chat-input-container" ref={containerRef}>
            <div className="textarea-parent">
                {popovers && <div className="composer-popovers">{popovers}</div>}
                {renderRow(
                    <>
                        <textarea
                            disabled={disabled}
                            ref={inputRef}
                            value={inputValue}
                            onChange={onInputChange}
                            onPaste={onPaste}
                            onKeyDown={handleKeyDown}
                            placeholder={placeholder}
                            aria-label={ariaLabel}
                            className="chat-text-input"
                            rows={1}
                        />

                        {loading && (
                            <div className="dots-loader">
                                <div className="dot"></div>
                                <div className="dot"></div>
                                <div className="dot"></div>
                            </div>
                        )}

                        {onStop && (
                            <button
                                type="button"
                                className="composer-stop-button"
                                onClick={onStop}
                                aria-label="Stop response"
                                title="Stop response"
                            >
                                <StopIcon/>
                            </button>
                        )}

                        {showSend && (
                            <button
                                type="button"
                                className="composer-send-button"
                                onClick={submitMessage}
                                disabled={!canSubmit}
                                aria-label="Send message"
                                title="Send message"
                            >
                                <ArrowUpIcon/>
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default MessageComposer;
