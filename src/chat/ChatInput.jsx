import {useEffect} from 'react';
import PropTypes from 'prop-types';
import './ChatInput.css';
import SlashCommandList from './SlashCommandList.jsx';
import SelectedCommandChip from './SelectedCommandChip.jsx';

function ChatInput({
    loading,
    inputValue,
    handleInputChange,
    handleSubmit,
    chatInputRef,
    commandCandidates,
    selectedIndex,
    selectedCommand,
    onCommandSelect,
    onArrowUp,
    onArrowDown,
    onDismiss,
    onDeselect,
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

    const hasCandidates = commandCandidates.length > 0;

    return (
        <div className="chat-input-container">
            <div className="textarea-parent">
                {selectedCommand && !loading && (
                    <SelectedCommandChip
                        selectedCommand={selectedCommand}
                        onDeselect={onDeselect}
                    />
                )}
                <SlashCommandList
                    commandCandidates={commandCandidates}
                    selectedIndex={selectedIndex}
                    onCommandSelect={onCommandSelect}
                />
                <textarea
                    disabled={loading}
                    ref={chatInputRef}
                    value={inputValue}
                    onChange={handleInputChange}
                    placeholder={loading ? "" : "Type a message..."}
                    className="chat-text-input"
                    rows={1}
                    onKeyDown={(event) => {

                        if (hasCandidates && event.key === 'ArrowDown') {
                            event.preventDefault();
                            onArrowDown();
                            return;
                        }

                        if (hasCandidates && event.key === 'ArrowUp') {
                            event.preventDefault();
                            onArrowUp();
                            return;
                        }

                        if (hasCandidates && event.key === 'Tab') {
                            event.preventDefault();
                            const targetIndex = selectedIndex >= 0 ? selectedIndex : 0;
                            onCommandSelect(commandCandidates[targetIndex]);
                            return;
                        }

                        if (hasCandidates && event.key === 'Escape') {
                            event.preventDefault();
                            onDismiss();
                            return;
                        }

                        if (event.key === 'Backspace' && inputValue === '' && selectedCommand) {
                            onDeselect();
                            return;
                        }

                        if (event.key === 'Enter' && !event.shiftKey) {
                            if (hasCandidates && selectedIndex >= 0) {
                                event.preventDefault();
                                onCommandSelect(commandCandidates[selectedIndex]);
                                return;
                            }

                            event.preventDefault();
                            handleSubmit().then(() => {
                                chatInputRef.current.style.height = "auto";
                                onDeselect();
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
    chatInputRef: PropTypes.object.isRequired,
    commandCandidates: PropTypes.array.isRequired,
    selectedIndex: PropTypes.number.isRequired,
    selectedCommand: PropTypes.object,
    onCommandSelect: PropTypes.func.isRequired,
    onArrowUp: PropTypes.func.isRequired,
    onArrowDown: PropTypes.func.isRequired,
    onDismiss: PropTypes.func.isRequired,
    onDeselect: PropTypes.func.isRequired,
};

export default ChatInput;
