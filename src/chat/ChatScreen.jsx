import {useCallback, useRef, useState, useEffect} from 'react';
import {ArrowDownIcon} from '@heroicons/react/20/solid';
import {toast} from 'react-toastify';
import {useSharedData} from "../context/useSharedData.jsx";

import './ChatScreen.css';

import ChatMessage from "./message/ChatMessage.jsx";
import ChatInput from "./composer/ChatInput.jsx";
import ElicitationPrompt from "../elicitation/ElicitationPrompt.jsx";
import AttachmentLightbox from "./attachment/AttachmentLightbox.jsx";
import InterestOfferBanner from "../interests/InterestOfferBanner.jsx";
import isEmptyNewConversation from "../interests/isEmptyNewConversation.js";
import NewsUpdateBanner from "../interests/NewsUpdateBanner.jsx";
import useInterestUpdate from '../hooks/useInterestUpdate.js';
import useChatHistory from '../hooks/useChatHistory.js';
import useChatUrlSync from '../hooks/useChatUrlSync.js';
import {useChatTurn} from '../context/useChatTurn.jsx';
import useElicitation from '../hooks/useElicitation.js';
import useSlashCommands from '../hooks/useSlashCommands.js';
import useSlashCommandSelection from '../hooks/useSlashCommandSelection.js';
import useChatModel from '../hooks/useChatModel.js';
import useAttachmentTray from '../hooks/useAttachmentTray.js';
import useScrollToBottom from '../hooks/useScrollToBottom.js';
import useKeyboardInset from '../hooks/useKeyboardInset.js';
import {isDismissibleElicitation} from '../service/ElicitationService.js';


function ChatScreen() {
    const {chatInputRef} = useSharedData();

    useEffect(() => {
        const handleCopy = (event) => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) return;

            const range = selection.getRangeAt(0);
            const startNode = range.startContainer;
            const startElement = startNode.nodeType === Node.ELEMENT_NODE ? startNode : startNode.parentElement;
            if (!startElement?.closest('.message-text')) return;

            const cleanText = selection.toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
            event.clipboardData.setData('text/plain', cleanText);
            event.preventDefault();
        };

        document.addEventListener('copy', handleCopy);
        return () => document.removeEventListener('copy', handleCopy);
    }, []);
    const chatSwitchResetRef = useRef(null);

    /*
     * Called before useChatHistory so its effect runs first: on a bookmarked `/chat/{id}` the
     * url is adopted into shared state on the same commit that hydration then reads.
     */
    const {clearOpenChat} = useChatUrlSync();

    /*
     * The id in the url names nothing the server will serve. Leaving the user on a permanently
     * empty transcript would be the worst outcome, so the chat is dropped and the url replaced —
     * replaced rather than pushed, so Back cannot walk straight into the same dead id.
     */
    const handleChatNotFound = useCallback(() => {
        clearOpenChat();
        toast.error('That conversation no longer exists.');
    }, [clearOpenChat]);

    const chatTurn = useChatTurn();

    const {chatId, chatHistory, setChatHistory, appendErrorMessage} = useChatHistory({
        onChatIdChangedExternally: () => {
            chatSwitchResetRef.current?.();
        },
        onChatNotFound: handleChatNotFound,
        onHydrated: chatTurn.attachIfInFlight,
    });
    const [isCaptionRowOpen, setIsCaptionRowOpen] = useState(false);
    const [lightboxAttachment, setLightboxAttachment] = useState(null);
    const lightboxInvokerRef = useRef(null);

    const attachmentTray = useAttachmentTray({chatId});
    const interestUpdate = useInterestUpdate(chatId);
    const chatModel = useChatModel({chatId, onChatNotFound: handleChatNotFound});

    /*
     * State is hoisted here, so the single lightbox instance cannot know which thumbnail
     * opened it. Capture the invoking element on the way in and restore focus on close.
     */
    const openLightbox = useCallback((attachment) => {
        lightboxInvokerRef.current = document.activeElement;
        setLightboxAttachment(attachment);
    }, []);

    const closeLightbox = useCallback(() => {
        setLightboxAttachment(null);
        lightboxInvokerRef.current?.focus?.();
        lightboxInvokerRef.current = null;
    }, []);

    const {
        turnInProgress: loading,
        inputValue,
        setInputValue,
        handleInputChange,
        handleStreamChunk,
        attachmentNotice,
        recoveryFailed,
        retryRecovery,
        streamActive,
        stopChat,
        activeElicitation,
        setActiveElicitation,
        elicitationValues,
        setElicitationValues,
        elicitationSubmitting,
        setElicitationSubmitting,
        getSelectedCommandRef,
        getMessageTextRef,
    } = chatTurn;

    const composerRef = useRef(null);
    const {scrollContainerRef, isScrolledAwayFromBottom, scrollToBottom} = useScrollToBottom(chatHistory, composerRef);
    const keyboardInset = useKeyboardInset();

    const {commandCandidates} = useSlashCommands({inputValue});

    const {selectedIndex, selectedCommand, isPinned, handleArrowDown, handleArrowUp, handleCommandSelect, handleDismiss, handlePinToggle} = useSlashCommandSelection({
        commandCandidates,
        setInputValue,
        onSettingCommandSelect: chatModel.openPicker,
    });

    getSelectedCommandRef.current = () => selectedCommand?.command || null;
    getMessageTextRef.current = () => inputValue.trim();
    chatSwitchResetRef.current = handleDismiss;

    const {handleElicitationChange, handleElicitationSubmit, dismissElicitation} = useElicitation({
        chatHistory,
        setChatHistory,
        handleStreamChunk,
        activeElicitation,
        setActiveElicitation,
        elicitationValues,
        setElicitationValues,
        elicitationSubmitting,
        setElicitationSubmitting,
        appendErrorMessage,
    });

    const handleSubmit = () => chatTurn.handleSubmit({
        attachmentTray,
        pendingModel: chatModel.pendingModel,
        rejectPendingModel: chatModel.rejectPendingModel,
        clearModelNotice: chatModel.clearModelNotice,
        dismissElicitation,
    });

    /* The composer is disabled until the run ends, so focus can only move there once it does. */
    const focusComposerWhenIdleRef = useRef(false);

    useEffect(() => {
        if (loading || !focusComposerWhenIdleRef.current) {
            return;
        }

        focusComposerWhenIdleRef.current = false;
        chatInputRef.current?.focus();
    }, [loading, chatInputRef]);

    const handlePromptSubmit = (overrideFields) => {
        focusComposerWhenIdleRef.current = true;

        return handleElicitationSubmit(overrideFields);
    };

    const trayStateClassName = attachmentTray.trayEntries.length > 0
        ? (isCaptionRowOpen ? ' chat-app--caption-open' : ' chat-app--tray-open')
        : '';

    return (
        <div className={`chat-app${trayStateClassName}`} style={{'--keyboard-inset': `${keyboardInset}px`}}>
            <div className="chat-content" ref={scrollContainerRef}>
                <NewsUpdateBanner update={interestUpdate}/>

                {chatHistory.map((entry) => (
                    <ChatMessage key={entry._key} message={entry} onExpandImage={openLightbox}/>
                ))}

                <InterestOfferBanner showing={isEmptyNewConversation(chatId, chatHistory)}/>

                {attachmentNotice && (
                    <div className="chat-attachment-notice" role="status">{attachmentNotice}</div>
                )}

                {chatModel.modelNotice && (
                    <div className="chat-attachment-notice chat-model-notice" role="status">{chatModel.modelNotice}</div>
                )}

                {recoveryFailed && (
                    <div className="chat-recovery-notice" role="status">
                        <span>Lost connection while the assistant was replying.</span>
                        <button type="button" className="chat-recovery-notice-retry" onClick={retryRecovery}>
                            Reload
                        </button>
                    </div>
                )}

                {lightboxAttachment && (
                    <AttachmentLightbox
                        attachment={lightboxAttachment}
                        onClose={closeLightbox}
                    />
                )}

                {activeElicitation && (
                    <ElicitationPrompt
                        elicitation={activeElicitation}
                        values={elicitationValues}
                        onChange={handleElicitationChange}
                        onSubmit={handlePromptSubmit}
                        submitting={elicitationSubmitting}
                    />
                )}

                <ChatInput
                    loading={loading}
                    promptOpen={isDismissibleElicitation(activeElicitation)}
                    streamActive={streamActive}
                    onStopChat={stopChat}
                    inputValue={inputValue}
                    handleInputChange={handleInputChange}
                    handleSubmit={handleSubmit}
                    chatInputRef={chatInputRef}
                    commandCandidates={commandCandidates}
                    selectedIndex={selectedIndex}
                    selectedCommand={selectedCommand}
                    isPinned={isPinned}
                    onTogglePin={handlePinToggle}
                    onCommandSelect={handleCommandSelect}
                    onArrowUp={handleArrowUp}
                    onArrowDown={handleArrowDown}
                    onDismiss={handleDismiss}
                    onDeselect={handleDismiss}
                    trayEntries={attachmentTray.trayEntries}
                    addFiles={attachmentTray.addFiles}
                    removeEntry={attachmentTray.removeEntry}
                    retryEntry={attachmentTray.retryEntry}
                    setEntryCaption={attachmentTray.setEntryCaption}
                    trayError={attachmentTray.trayError}
                    onCaptionOpenChange={setIsCaptionRowOpen}
                    composerContainerRef={composerRef}
                    modelPicker={chatModel}
                />
            </div>

            {/*
              * Sits outside the scroll container so it stays pinned above the composer while
              * the transcript scrolls underneath it.
              */}
            {isScrolledAwayFromBottom && (
                <button
                    type="button"
                    className="chat-scroll-to-bottom"
                    onClick={scrollToBottom}
                    aria-label="Scroll to latest message"
                    title="Scroll to latest message"
                >
                    <ArrowDownIcon/>
                </button>
            )}
        </div>
    );
}

export default ChatScreen;
