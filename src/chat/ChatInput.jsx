import {useEffect} from 'react';
import PropTypes from 'prop-types';
import './ChatInput.css';
import SlashCommandList from './SlashCommandList.jsx';
import SelectedCommandChip from './SelectedCommandChip.jsx';
import ComposerAttachments from './ComposerAttachments.jsx';
import {ACCEPTED_IMAGE_CONTENT_TYPES} from '../util/imageValidation.js';

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
    trayEntries,
    addFiles,
    removeEntry,
    retryEntry,
    setEntryCaption,
    trayError,
    onCaptionOpenChange,
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

    /*
     * Pasting is the primary attach path, and it is the one handler that cannot move into
     * ComposerAttachments — the paste target has to be the textarea itself. A paste
     * carrying both text and an image keeps the text.
     */
    const handlePaste = (event) => {
        if (loading || !addFiles) {
            return;
        }

        const clipboardItems = Array.from(event.clipboardData?.items || []);
        const imageFiles = clipboardItems
            .filter((clipboardItem) => clipboardItem.kind === 'file' && ACCEPTED_IMAGE_CONTENT_TYPES.includes(clipboardItem.type))
            .map((clipboardItem) => clipboardItem.getAsFile())
            .filter((clipboardFile) => !!clipboardFile);

        if (imageFiles.length === 0) {
            return;
        }

        const pastedText = event.clipboardData?.getData('text/plain') || '';

        if (!pastedText) {
            event.preventDefault();
        }

        addFiles(imageFiles);
    };

    return (
        <div className="chat-input-container">
            <div className="textarea-parent">
                {/*
                  * Both popovers live in one absolutely-positioned stack above the composer.
                  * Previously the chip was an in-flow flex child, so selecting a command
                  * pushed the textarea out of the row entirely. The chip renders last so it
                  * sits closest to the input it applies to.
                  */}
                <div className="composer-popovers">
                    <SlashCommandList
                        commandCandidates={commandCandidates}
                        selectedIndex={selectedIndex}
                        onCommandSelect={onCommandSelect}
                    />
                    {selectedCommand && !loading && (
                        <SelectedCommandChip
                            selectedCommand={selectedCommand}
                            onDeselect={onDeselect}
                        />
                    )}
                </div>
                <ComposerAttachments
                    trayEntries={trayEntries}
                    addFiles={addFiles}
                    removeEntry={removeEntry}
                    retryEntry={retryEntry}
                    setEntryCaption={setEntryCaption}
                    trayError={trayError}
                    loading={loading}
                    onCaptionOpenChange={onCaptionOpenChange}
                >
                    <textarea
                        disabled={loading}
                        ref={chatInputRef}
                        value={inputValue}
                        onChange={handleInputChange}
                        onPaste={handlePaste}
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
                                if (hasCandidates && (selectedIndex >= 0 || commandCandidates.length === 1)) {
                                    event.preventDefault();
                                    const targetIndex = selectedIndex >= 0 ? selectedIndex : 0;
                                    onCommandSelect(commandCandidates[targetIndex]);
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
                </ComposerAttachments>
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
    trayEntries: PropTypes.array,
    addFiles: PropTypes.func,
    removeEntry: PropTypes.func,
    retryEntry: PropTypes.func,
    setEntryCaption: PropTypes.func,
    trayError: PropTypes.string,
    onCaptionOpenChange: PropTypes.func,
};

export default ChatInput;
