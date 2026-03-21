import { useEffect } from 'react';
import PropTypes from 'prop-types';
import './ChatInput.css';
import McpTool from "./McpTool.jsx";

function ChatInput({
    loading,
    inputValue,
    handleInputChange,
    handleSubmit,
    chatInputRef,
    ghostText,
    onTabAccept,
}) {
    useEffect(() => {
        const adjustInputHeight = () => {
            if (chatInputRef.current) {
                chatInputRef.current.style.height = "auto";
                chatInputRef.current.style.height = `${chatInputRef.current.scrollHeight}px`;
            }
        };

        adjustInputHeight();

        if (chatInputRef.current) {
            chatInputRef.current.focus();
        }
    }, [chatInputRef, inputValue]);

    return (
        <div className="chat-input-container">
            <div className="textarea-parent">
                {ghostText && !loading && (
                    <McpTool inputValue={inputValue}
                             ghostText={ghostText} />
                )}
                <textarea
                    disabled={loading}
                    ref={chatInputRef}
                    value={inputValue}
                    onChange={handleInputChange}
                    placeholder={loading ? "" : "Type a message..."}
                    className="chat-text-input"
                    rows={1}
                    onKeyDown={(event) => {

                        if (event.key === 'Tab' && ghostText) {
                            event.preventDefault();
                            onTabAccept();
                            return;
                        }

                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            handleSubmit().then(() => {
                                chatInputRef.current.style.height = "auto";
                            });
                        }
                    }}
                />
                {loading && (
                    <div className="dots-loader">
                        <div className="dot"></div>
                        <div className="dot"></div>
                        <div className="dot"></div>
                    </div>
                )}
            </div>
        </div>
    );
}

ChatInput.propTypes = {
    loading: PropTypes.bool.isRequired,
    inputValue: PropTypes.string.isRequired,
    handleInputChange: PropTypes.func.isRequired,
    handleSubmit: PropTypes.func.isRequired,
    ghostText: PropTypes.string.isRequired,
    onTabAccept: PropTypes.func.isRequired,
    chatInputRef: PropTypes.shape({
        current: PropTypes.any
    }).isRequired
};

export default ChatInput;
