import SlashCommandList from '../command/SlashCommandList.jsx';
import SelectedCommandChip from '../command/SelectedCommandChip.jsx';
import ModelPicker from '../command/ModelPicker.jsx';
import ComposerAttachments from './ComposerAttachments.jsx';
import MessageComposer from './MessageComposer.jsx';
import {ACCEPTED_ATTACHMENT_CONTENT_TYPES} from '../../util/imageValidation.js';

function ChatInput({
    loading,
    promptOpen = false,
    streamActive,
    onStopChat,
    inputValue,
    handleInputChange,
    handleSubmit,
    chatInputRef,
    commandCandidates,
    selectedIndex,
    selectedCommand,
    isPinned,
    onTogglePin,
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
    composerContainerRef,
    modelPicker,
}) {
    const pickerOpen = !!modelPicker?.pickerOpen;
    const visibleCommandCandidates = loading ? [] : commandCandidates;
    const hasCandidates = visibleCommandCandidates.length > 0;

    /* An open dismissible prompt keeps the run going but still takes a typed answer. */
    const inputLocked = loading && !promptOpen;

    /*
     * Attachments alone are not a message; a freshly selected command is. A pinned one still needs
     * an argument, or a stray Enter after every reply would resend the bare command.
     */
    const canSubmit = !inputLocked && !pickerOpen && (inputValue.trim().length > 0 || (!!selectedCommand && !isPinned));

    const submitTurn = () => handleSubmit().then((submitted) => {
        /* A pinned command stays selected so it is resent on the next turn too. */
        if (submitted && !isPinned) {
            onDeselect();
        }

        return submitted;
    });

    const selectCandidate = () => {
        const targetIndex = selectedIndex >= 0 ? selectedIndex : 0;
        onCommandSelect(visibleCommandCandidates[targetIndex]);
    };

    const handleCommandKeyDown = (event) => {
        if (hasCandidates && event.key === 'ArrowDown') {
            event.preventDefault();
            onArrowDown();
            return true;
        }

        if (hasCandidates && event.key === 'ArrowUp') {
            event.preventDefault();
            onArrowUp();
            return true;
        }

        if (hasCandidates && event.key === 'Tab') {
            event.preventDefault();
            selectCandidate();
            return true;
        }

        if (hasCandidates && event.key === 'Escape') {
            event.preventDefault();
            onDismiss();
            return true;
        }

        if (event.key === 'Backspace' && inputValue === '' && selectedCommand) {
            onDeselect();
            return true;
        }

        if (event.key === 'Enter' && !event.shiftKey && hasCandidates && (selectedIndex >= 0 || visibleCommandCandidates.length === 1)) {
            event.preventDefault();
            selectCandidate();
            return true;
        }

        return false;
    };

    /* The paste target has to be the textarea itself. A paste carrying both text and a file keeps the text. */
    const handlePaste = (event) => {
        if (loading || !addFiles) {
            return;
        }

        const clipboardItems = Array.from(event.clipboardData?.items || []);
        const attachableFiles = clipboardItems
            .filter((clipboardItem) => clipboardItem.kind === 'file' && ACCEPTED_ATTACHMENT_CONTENT_TYPES.includes(clipboardItem.type))
            .map((clipboardItem) => clipboardItem.getAsFile())
            .filter((clipboardFile) => !!clipboardFile);

        if (attachableFiles.length === 0) {
            return;
        }

        const pastedText = event.clipboardData?.getData('text/plain') || '';

        if (!pastedText) {
            event.preventDefault();
        }

        addFiles(attachableFiles);
    };

    const popovers = (
        <>
            <SlashCommandList
                commandCandidates={visibleCommandCandidates}
                selectedIndex={selectedIndex}
                onCommandSelect={onCommandSelect}
            />
            {pickerOpen && (
                <ModelPicker
                    options={modelPicker.options}
                    loading={modelPicker.loadingOptions}
                    saving={modelPicker.savingModel}
                    error={modelPicker.pickerError}
                    pendingModel={modelPicker.pendingModel}
                    onChoose={modelPicker.choose}
                    onResetToDefault={modelPicker.resetToDefault}
                    onRetry={modelPicker.openPicker}
                    onClose={modelPicker.closePicker}
                />
            )}
            {selectedCommand && (!loading || isPinned) && (
                <SelectedCommandChip
                    selectedCommand={selectedCommand}
                    isPinned={isPinned}
                    onTogglePin={onTogglePin}
                    onDeselect={onDeselect}
                />
            )}
        </>
    );

    const renderAttachmentRow = (row) => (
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
            {row}
        </ComposerAttachments>
    );

    return (
        <MessageComposer
            inputRef={chatInputRef}
            inputValue={inputValue}
            onInputChange={handleInputChange}
            onSubmit={submitTurn}
            canSubmit={canSubmit}
            disabled={inputLocked}
            placeholder={promptOpen && loading ? 'Or type your answer…' : (loading ? "" : "Type a message...")}
            loading={loading && !streamActive}
            onStop={streamActive ? onStopChat : null}
            showSend={!streamActive || promptOpen}
            focusSuppressed={pickerOpen}
            onKeyDown={handleCommandKeyDown}
            onPaste={handlePaste}
            popovers={popovers}
            renderRow={renderAttachmentRow}
            containerRef={composerContainerRef}
        />
    );
}

export default ChatInput;
