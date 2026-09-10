import {useCallback, useRef, useState, useEffect} from 'react';
import {ArrowDownIcon} from '@heroicons/react/20/solid';
import {toast} from 'react-toastify';
import ConsoleErrors from "../common/ConsoleErrors";
import {useSharedData} from "../context/useSharedData.jsx";

import './ChatScreen.css';

import ChatMessage from "./message/ChatMessage.jsx";
import ChatInput from "./composer/ChatInput.jsx";
import ElicitationPrompt from "../elicitation/ElicitationPrompt.jsx";
import AttachmentLightbox from "./attachment/AttachmentLightbox.jsx";
import useChatHistory from '../hooks/useChatHistory.js';
import useChatUrlSync from '../hooks/useChatUrlSync.js';
import useChatStream from '../hooks/useChatStream.js';
import useElicitation from '../hooks/useElicitation.js';
import useSlashCommands from '../hooks/useSlashCommands.js';
import useSlashCommandSelection from '../hooks/useSlashCommandSelection.js';
import useAttachmentTray from '../hooks/useAttachmentTray.js';
import useScrollToBottom from '../hooks/useScrollToBottom.js';
import useKeyboardInset from '../hooks/useKeyboardInset.js';


function ChatScreen() {
    const {chatInputRef, setStreamingChatId} = useSharedData();

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
    const abortActiveStreamRef = useRef(null);

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

    const {chatId, chatHistory, setChatHistory, appendToLastAIMessage, appendNotificationToLastAIMessage, updateSeededNotificationText, attachGeneratedImagesToLastAIMessage, stopStreamingLastAIMessage, reloadChatHistory, finalizeLastAIMessage, ensureChatIdFromResponse, adoptMessageIdForLastUserMessage, updateAttachmentStatus} = useChatHistory({
        onChatIdChangedExternally: () => {
            /*
             * The conversation on screen is being replaced — a sidebar pick, New Chat, a delete,
             * or a back navigation. Nothing cancels the turn server-side, but its remaining
             * frames would land on whatever bubble now ends the new transcript, so this client
             * lets go of the stream before that can happen. Suppressed by `adoptedChatIdRef` for
             * a new chat learning its own id, which must not abort the stream that issued it.
             */
            abortActiveStreamRef.current?.();
            chatSwitchResetRef.current?.();
        },
        onChatNotFound: handleChatNotFound,
    });
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

    const {loading, error, setError, inputValue, setInputValue, handleInputChange, handleSubmit, handleStreamChunk, abortActiveStream, attachmentNotice, recoveryFailed, retryRecovery} = useChatStream({
        chatId,
        chatHistory,
        setChatHistory,
        appendToLastAIMessage,
        appendNotificationToLastAIMessage,
        updateSeededNotificationText,
        attachGeneratedImagesToLastAIMessage,
        stopStreamingLastAIMessage,
        reloadChatHistory,
        finalizeLastAIMessage,
        ensureChatIdFromResponse,
        adoptMessageIdForLastUserMessage,
        updateAttachmentStatus,
        activeElicitation,
        setActiveElicitation,
        setElicitationSubmitting,
        setElicitationValues,
        getSelectedCommandRef,
        getMessageTextRef,
        attachmentTray,
    });

    /*
     * Publishes which conversation is mid-turn, so the history drawer can refuse to delete it — the
     * backend runs an in-flight turn to completion and would write its message onto a conversation
     * that no longer exists.
     *
     * Derived from `loading` rather than set once when the turn starts: on a new chat the id only
     * arrives with the `init` frame, and `loading` going false is what `done` and `error` both
     * amount to here.
     */
    useEffect(() => {
        setStreamingChatId(loading ? chatId : null);
    }, [loading, chatId, setStreamingChatId]);

    const composerRef = useRef(null);
    const {scrollContainerRef, isScrolledAwayFromBottom, scrollToBottom} = useScrollToBottom(chatHistory, composerRef);
    const keyboardInset = useKeyboardInset();

    const {commandCandidates} = useSlashCommands({inputValue});

    const {selectedIndex, selectedCommand, isPinned, handleArrowDown, handleArrowUp, handleCommandSelect, handleDismiss, handlePinToggle} = useSlashCommandSelection({
        commandCandidates,
        setInputValue,
    });

    getSelectedCommandRef.current = () => selectedCommand?.command || null;
    getMessageTextRef.current = () => inputValue.trim();
    chatSwitchResetRef.current = handleDismiss;
    abortActiveStreamRef.current = abortActiveStream;

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
        <div className={`chat-app${trayStateClassName}`} style={{'--keyboard-inset': `${keyboardInset}px`}}>
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
