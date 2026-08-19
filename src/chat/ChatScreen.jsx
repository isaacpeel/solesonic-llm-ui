import {useCallback, useRef, useState, useEffect} from 'react';
import {ArrowDownIcon} from '@heroicons/react/20/solid';
import ConsoleErrors from "../common/ConsoleErrors";
import {useSharedData} from "../context/useSharedData.jsx";

import './ChatScreen.css';

import ChatMessage from "./message/ChatMessage.jsx";
import ChatInput from "./composer/ChatInput.jsx";
import ElicitationPrompt from "../elicitation/ElicitationPrompt.jsx";
import AttachmentLightbox from "./attachment/AttachmentLightbox.jsx";
import useChatHistory from '../hooks/useChatHistory.js';
import useChatStream from '../hooks/useChatStream.js';
import useElicitation from '../hooks/useElicitation.js';
import useSlashCommands from '../hooks/useSlashCommands.js';
import useSlashCommandSelection from '../hooks/useSlashCommandSelection.js';
import useAttachmentTray from '../hooks/useAttachmentTray.js';
import useScrollToBottom from '../hooks/useScrollToBottom.js';


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
    const {chatId, chatHistory, setChatHistory, appendToLastAIMessage, appendNotificationToLastAIMessage, updateSeededNotificationText, attachGeneratedImagesToLastAIMessage, stopStreamingLastAIMessage, markLastAIMessageReconnecting, clearReconnectingMark, reloadChatHistory, finalizeLastAIMessage, ensureChatIdFromResponse, adoptMessageIdForLastUserMessage} = useChatHistory();
    const [activeElicitation, setActiveElicitation] = useState(null);
    const [elicitationValues, setElicitationValues] = useState({});
    const [elicitationSubmitting, setElicitationSubmitting] = useState(false);
    const getSelectedCommandRef = useRef(null);
    const getMessageTextRef = useRef(null);
    const [isCaptionRowOpen, setIsCaptionRowOpen] = useState(false);
    const [lightboxAttachment, setLightboxAttachment] = useState(null);
    const lightboxInvokerRef = useRef(null);

    const attachmentTray = useAttachmentTray({chatId});

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

    const {loading, error, setError, inputValue, setInputValue, handleInputChange, handleSubmit, handleStreamChunk, attachmentNotice, recoveryFailed, retryRecovery} = useChatStream({
        chatId,
        chatHistory,
        setChatHistory,
        appendToLastAIMessage,
        appendNotificationToLastAIMessage,
        updateSeededNotificationText,
        attachGeneratedImagesToLastAIMessage,
        stopStreamingLastAIMessage,
        markLastAIMessageReconnecting,
        clearReconnectingMark,
        reloadChatHistory,
        finalizeLastAIMessage,
        ensureChatIdFromResponse,
        adoptMessageIdForLastUserMessage,
        activeElicitation,
        setActiveElicitation,
        setElicitationSubmitting,
        setElicitationValues,
        getSelectedCommandRef,
        getMessageTextRef,
        attachmentTray,
    });

    const {scrollContainerRef, isScrolledAwayFromBottom, scrollToBottom} = useScrollToBottom(chatHistory);

    const {commandCandidates} = useSlashCommands({inputValue});

    const {selectedIndex, selectedCommand, handleArrowDown, handleArrowUp, handleCommandSelect, handleDismiss} = useSlashCommandSelection({
        commandCandidates,
        setInputValue,
    });

    getSelectedCommandRef.current = () => selectedCommand?.command || null;
    getMessageTextRef.current = () => inputValue.trim();

    const {handleElicitationChange, handleElicitationSubmit} = useElicitation({
        chatHistory,
        setChatHistory,
        handleStreamChunk,
        activeElicitation,
        setActiveElicitation,
        elicitationValues,
        setElicitationValues,
        elicitationSubmitting,
        setElicitationSubmitting,
        setError,
    });

    const trayStateClassName = attachmentTray.trayEntries.length > 0
        ? (isCaptionRowOpen ? ' chat-app--caption-open' : ' chat-app--tray-open')
        : '';

    return (
        <div className={`chat-app${trayStateClassName}`}>
            {error && <ConsoleErrors error={error}/>}

            <div className="chat-content" ref={scrollContainerRef}>
                {chatHistory.map((entry) => (
                    <ChatMessage key={entry._key} message={entry} onExpandImage={openLightbox}/>
                ))}

                {attachmentNotice && (
                    <div className="chat-attachment-notice" role="status">{attachmentNotice}</div>
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
                        onSubmit={handleElicitationSubmit}
                        submitting={elicitationSubmitting}
                    />
                )}

                <ChatInput
                    loading={loading}
                    inputValue={inputValue}
                    handleInputChange={handleInputChange}
                    handleSubmit={handleSubmit}
                    chatInputRef={chatInputRef}
                    commandCandidates={commandCandidates}
                    selectedIndex={selectedIndex}
                    selectedCommand={selectedCommand}
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
