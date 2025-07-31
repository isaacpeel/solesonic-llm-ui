import { useEffect } from 'react';
import PropTypes from 'prop-types';
import './ChatInput.css';

function ChatInput({
    loading, 
    inputValue, 
    handleInputChange, 
    handleSubmit, 
    chatInputRef 
}) {
    useEffect(() => {
        const adjustInputHeight = () => {
            if (chatInputRef.current) {
                chatInputRef.current.style.height = "auto";
                const scrollHeight = inputValue.length <= 54
                    ? chatInputRef.current.scrollHeight - 36
                    : chatInputRef.current.scrollHeight - 16;
                chatInputRef.current.style.height = `${scrollHeight}px`;
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
                <textarea
                    disabled={loading}
                    ref={chatInputRef}
                    value={inputValue}
                    onChange={handleInputChange}
                    placeholder={loading ? "" : "Type a message..."}
                    className="chat-text-input"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSubmit().then(() => {
                                chatInputRef.current.style.height = "1rem";
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
    chatInputRef: PropTypes.shape({
        current: PropTypes.any
    }).isRequired
};

export default ChatInput;
