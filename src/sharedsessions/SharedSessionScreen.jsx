import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router';
import {ArrowDownIcon} from '@heroicons/react/20/solid';
import log from 'loglevel';
import ChatMessage, {USER} from '../chat/message/ChatMessage.jsx';
import MessageComposer from '../chat/composer/MessageComposer.jsx';
import ChatInput from '../chat/composer/ChatInput.jsx';
import AttachmentLightbox from '../chat/attachment/AttachmentLightbox.jsx';
import ElicitationPrompt from '../elicitation/ElicitationPrompt.jsx';
import useSoundPlayer from '../hooks/useSoundPlayer.js';
import useSharedSessionStream from '../hooks/useSharedSessionStream.js';
import useScrollToBottom from '../hooks/useScrollToBottom.js';
import useKeyboardInset from '../hooks/useKeyboardInset.js';
import useAttachmentTray from '../hooks/useAttachmentTray.js';
import useChatModel from '../hooks/useChatModel.js';
import useSlashCommands from '../hooks/useSlashCommands.js';
import useSlashCommandSelection from '../hooks/useSlashCommandSelection.js';
import sharedSessionService, {SESSION_STATUSES, describeSessionError} from '../service/SharedSessionService.js';
import authService from '../service/AuthService.js';
import {useSharedData} from '../context/useSharedData.jsx';
import {resolveElicitationAction} from '../service/ElicitationService.js';
import LeaveSessionButton from './LeaveSessionButton.jsx';
import AddPeopleDialog from './AddPeopleDialog.jsx';
import {isConversationSession, sharedAgentForSession} from './sharedAgents.js';
import {MAXIMUM_CONVERSATION_MESSAGE_CHARACTERS, MAXIMUM_OTHER_PARTICIPANTS} from './sharedConversationLimits.js';
import {isPromptForViewer, isViewersTurn, viewerParticipantName, waitingOn} from './sharedSessionTranscript.js';
import {presentForViewer} from '../chat/message/hiddenSections.js';
import '../chat/ChatScreen.css';
import './SharedSessions.css';

function statusBanner({session, agent, activeRun, viewerUserId, promptForViewer}) {
    if (!session) {
        return {text: '', forViewer: false};
    }

    if (session.status === SESSION_STATUSES.CLOSED) {
        return {text: 'A participant left this session.', forViewer: false};
    }

    if (session.status === SESSION_STATUSES.EXPIRED) {
        return {text: 'This session expired.', forViewer: false};
    }

    if (activeRun) {
        return {text: 'The agent is responding…', forViewer: false};
    }

    if (session.status === SESSION_STATUSES.COMPLETED) {
        return {text: agent.completedText, forViewer: false};
    }

    if (promptForViewer || isViewersTurn(session, viewerUserId)) {
        return {text: 'Waiting on you', forViewer: true};
    }

    const others = waitingOn(session, viewerUserId);

    if (others.length > 0) {
        return {text: `Waiting on ${others.join(' and ')}…`, forViewer: false};
    }

    return {text: agent.idleHint, forViewer: false};
}

function conversationBanner({session, activeRun}) {
    if (session.status === SESSION_STATUSES.CLOSED) {
        return {text: 'This chat ended.', forViewer: false};
    }

    if (session.status === SESSION_STATUSES.EXPIRED) {
        return {text: 'This chat expired.', forViewer: false};
    }

    return {text: activeRun ? 'The assistant is responding…' : '', forViewer: false};
}

function composerPlaceholder({activeRun, banner, otherName, agent, conversation}) {
    if (activeRun) {
        return '';
    }

    if (conversation) {
        return 'Message the group…';
    }

    if (banner.forViewer || !otherName) {
        return 'Type a message...';
    }

    return agent.waitingHint ? `Waiting on ${otherName} (${agent.waitingHint})` : `Waiting on ${otherName}`;
}

function leaveCopy(conversation, viewerOwnsChat) {
    if (!conversation) {
        return {};
    }

    return viewerOwnsChat
        ? {
            triggerLabel: 'End sharing for everyone',
            confirmText: 'End sharing for everyone?',
            confirmLabel: 'End sharing for everyone',
            keepLabel: 'Keep sharing',
        }
        : {
            triggerLabel: 'Leave chat',
            confirmText: 'Leave this chat?',
            confirmLabel: 'Leave chat',
            keepLabel: 'Stay in the chat',
        };
}

const SharedSessionScreenBody = ({sessionId}) => {
    const navigate = useNavigate();
    const setReloadHistoryTrigger = useSharedData()?.setReloadHistoryTrigger;

    const [viewerUserId, setViewerUserId] = useState(null);
    const [inputValue, setInputValue] = useState('');
    const [sending, setSending] = useState(false);
    const [notice, setNotice] = useState(null);
    const [promptValues, setPromptValues] = useState({});
    const [myRunId, setMyRunId] = useState(null);
    const [addingPeople, setAddingPeople] = useState(false);
    const [invitedLocally, setInvitedLocally] = useState({people: [], session: null});
    const [isCaptionRowOpen, setIsCaptionRowOpen] = useState(false);
    const [lightboxAttachment, setLightboxAttachment] = useState(null);
    const composerInputRef = useRef(null);
    const composerRef = useRef(null);
    const lightboxInvokerRef = useRef(null);

    const {playSound, attachSoundSurface} = useSoundPlayer();

    useEffect(() => attachSoundSurface(), [attachSoundSurface]);

    useEffect(() => {
        let cancelled = false;

        authService.getUserId()
            .then((userId) => {
                if (!cancelled) {
                    setViewerUserId(userId);
                }
            })
            .catch((caughtError) => log.error('[SharedSessionScreen] Could not read the signed-in user', caughtError));

        return () => {
            cancelled = true;
        };
    }, []);

    const {session, messages, activeRun, loading, loadError, connected} = useSharedSessionStream({
        sessionId,
        viewerUserId,
        onSoundCue: playSound,
    });

    const {scrollContainerRef, isScrolledAwayFromBottom, scrollToBottom} = useScrollToBottom(messages, composerRef);
    const keyboardInset = useKeyboardInset();

    const viewerName = viewerParticipantName(session, viewerUserId);

    const presentedMessages = useMemo(() => messages.map((message) => {
        const text = presentForViewer(message.text, viewerName);
        return text === message.text ? message : {...message, text};
    }), [messages, viewerName]);

    const conversation = isConversationSession(session);
    const agent = sharedAgentForSession(session);
    const chatId = conversation ? session.chatId ?? null : null;

    const attachmentTray = useAttachmentTray({chatId, persistDraft: !!chatId});
    const chatModel = useChatModel({
        chatId,
        currentModel: conversation && session && 'model' in session ? session.model ?? null : undefined,
    });

    const fetchSharedCommands = useCallback((command) => sharedSessionService.commands(sessionId, command), [sessionId]);
    const {commandCandidates} = useSlashCommands({
        inputValue: conversation ? inputValue : '',
        setInputValue,
        fetchCommands: fetchSharedCommands,
    });
    const {
        selectedIndex,
        selectedCommand,
        isPinned,
        handleArrowDown,
        handleArrowUp,
        handleCommandSelect,
        handleDismiss,
        handlePinToggle,
    } = useSlashCommandSelection({
        commandCandidates,
        setInputValue,
        onSettingCommandSelect: chatModel.openPicker,
    });

    const openLightbox = useCallback((attachment) => {
        lightboxInvokerRef.current = document.activeElement;
        setLightboxAttachment(attachment);
    }, []);

    const closeLightbox = useCallback(() => {
        setLightboxAttachment(null);
        lightboxInvokerRef.current?.focus?.();
        lightboxInvokerRef.current = null;
    }, []);
    const promptForViewer = isPromptForViewer(session, viewerUserId);
    const elicitationId = session?.prompt?.elicitationId;

    useEffect(() => {
        setPromptValues({});
    }, [elicitationId]);

    const takesMessages = session?.status === SESSION_STATUSES.ACTIVE || session?.status === SESSION_STATUSES.COMPLETED;
    const banner = conversation
        ? conversationBanner({session, activeRun})
        : statusBanner({session, agent, activeRun, viewerUserId, promptForViewer});
    const myRunActive = !!activeRun && activeRun.runId === myRunId;
    const composerLocked = !!activeRun || sending;
    const lastUserMessage = [...messages].reverse().find((message) => message.type === USER);
    const viewerMayStop = !isConversationSession(session) || session?.ownerUserId === viewerUserId || myRunActive || !!lastUserMessage?.mine;

    const elicitation = useMemo(() => promptForViewer && session?.prompt ? {
        elicitationId: session.prompt.elicitationId,
        message: session.prompt.message,
        requestedSchema: session.prompt.requestedSchema,
        _meta: session.prompt.meta,
    } : null, [promptForViewer, session?.prompt]);

    const runSend = useCallback(async (send) => {
        setSending(true);
        setNotice(null);

        try {
            const accepted = await send();
            setMyRunId(accepted?.runId ?? null);
            return true;
        } catch (caughtError) {
            log.warn('[SharedSessionScreen] A message was refused', caughtError);
            setNotice(describeSessionError(caughtError));
            return false;
        } finally {
            setSending(false);
        }
    }, []);

    const handleSubmit = useCallback(async () => {
        const text = inputValue.trim();

        if (!text || sending) {
            return false;
        }

        setInputValue('');

        if (!await runSend(() => sharedSessionService.send(sessionId, text))) {
            setInputValue(text);
            return false;
        }

        return true;
    }, [sessionId, inputValue, runSend, sending]);

    const handleConversationSubmit = useCallback(async () => {
        if (sending || attachmentTray.hasPendingUploads) {
            return false;
        }

        const text = inputValue.trim();
        const command = selectedCommand?.command ?? null;

        if (!text && !command && attachmentTray.stagedAttachmentIds.length === 0) {
            return false;
        }

        setInputValue('');
        setSending(true);
        setNotice(null);
        chatModel.clearModelNotice();

        const settledEntries = await attachmentTray.commitCaptions();
        const attachmentIds = settledEntries.map((entry) => entry.attachmentId).filter(Boolean);

        const sent = await runSend(() => sharedSessionService.send(sessionId, text, {
            attachmentIds,
            commands: command ? [command] : [],
        }));

        if (!sent) {
            setInputValue(text);
            return false;
        }

        attachmentTray.clearTray();

        return true;
    }, [sessionId, inputValue, selectedCommand, sending, runSend, attachmentTray, chatModel]);

    const handlePromptSubmit = useCallback(async (overrides) => {
        if (!elicitationId) {
            return;
        }

        const fields = {...promptValues, ...(overrides ?? {})};

        await runSend(() => sharedSessionService.answerPrompt(sessionId, elicitationId, resolveElicitationAction(fields), fields));
    }, [elicitationId, sessionId, promptValues, runSend]);

    const handlePromptChange = useCallback((propertyName, value) => {
        setPromptValues((current) => ({...current, [propertyName]: value}));
    }, []);

    const handleCancel = useCallback(async () => {
        try {
            await sharedSessionService.cancel(sessionId);
        } catch (caughtError) {
            log.warn('[SharedSessionScreen] Could not stop the run', caughtError);
        }
    }, [sessionId]);

    const handleLeave = useCallback(async () => {
        try {
            await sharedSessionService.leave(sessionId);
            setReloadHistoryTrigger?.((trigger) => trigger + 1);
            navigate('/shared-sessions');
        } catch (caughtError) {
            setNotice(describeSessionError(caughtError));
        }
    }, [sessionId, navigate, setReloadHistoryTrigger]);

    if (loadError) {
        return (
            <div className="chat-app shared-session-screen">
                <div className="chat-content">
                    <p className="shared-session-column shared-sessions-notice shared-sessions-notice--error">This session could not be loaded.</p>
                    <Link className="shared-session-column" to="/shared-sessions">Back to shared sessions</Link>
                </div>
            </div>
        );
    }

    if (loading || !session) {
        return (
            <div className="chat-app shared-session-screen">
                <div className="chat-content">
                    <p className="shared-session-column shared-sessions-notice">Loading…</p>
                </div>
            </div>
        );
    }

    const participants = (session.participants ?? []).map((participant) => participant.name).join(', ');
    const otherName = waitingOn(session, viewerUserId)[0];

    const seatedIds = new Set((session.participants ?? []).map((participant) => participant.userId));
    const locallyInvited = invitedLocally.session === session ? invitedLocally.people : [];
    const pendingInvitees = [...(session.pendingInvitees ?? []), ...locallyInvited]
        .filter((invitee, index, all) => !seatedIds.has(invitee.userId)
            && all.findIndex((candidate) => candidate.userId === invitee.userId) === index);

    const viewerOwnsChat = conversation && !!viewerUserId && session.ownerUserId === viewerUserId;
    const seatsLeft = MAXIMUM_OTHER_PARTICIPANTS - Math.max((session.participants ?? []).length - 1, 0) - pendingInvitees.length;

    const trayStateClassName = conversation && attachmentTray.trayEntries.length > 0
        ? (isCaptionRowOpen ? ' chat-app--caption-open' : ' chat-app--tray-open')
        : '';

    return (
        <div className={`chat-app shared-session-screen${trayStateClassName}`} style={{'--keyboard-inset': `${keyboardInset}px`}}>
            <div className="chat-content" ref={scrollContainerRef}>
                <div className="shared-session-column shared-session-header">
                    <div className="shared-session-header-title">
                        <Link to="/shared-sessions">Shared sessions</Link>
                        {conversation ? (
                            <>
                                <span className="shared-session-participants"> · {agent.label}</span>
                                <ul className="shared-session-participant-chips" role="list">
                                    {(session.participants ?? []).map((participant) => (
                                        <li key={participant.userId} className="shared-session-participant-chip">{participant.name}</li>
                                    ))}
                                    {pendingInvitees.map((invitee) => (
                                        <li
                                            key={invitee.userId}
                                            className="shared-session-participant-chip shared-session-participant-chip--pending"
                                            title={invitee.displayName || invitee.username}
                                        >
                                            {invitee.username} (invited)
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : (
                            <span className="shared-session-participants"> · {agent.label} · {participants}</span>
                        )}
                        {!connected && <span className="shared-sessions-notice"> · reconnecting…</span>}
                    </div>
                    {viewerOwnsChat && takesMessages && (
                        <button
                            type="button"
                            className="shared-sessions-button"
                            disabled={seatsLeft <= 0}
                            title={seatsLeft <= 0 ? 'This chat is full.' : undefined}
                            onClick={() => setAddingPeople(true)}
                        >
                            Add people
                        </button>
                    )}
                    {takesMessages && <LeaveSessionButton onConfirm={handleLeave} {...leaveCopy(conversation, viewerOwnsChat)}/>}
                </div>

                <div className={`shared-session-column shared-session-status-banner ${banner.forViewer ? 'shared-session-status-banner--viewer' : ''}`} role="status">
                    {banner.text}
                </div>

                {presentedMessages.map((message) => {
                    const fromOther = message.type === USER && !message.mine;
                    const senderLabel = message.type === USER
                        ? (message.mine ? 'You' : message.senderName ?? 'Someone')
                        : null;

                    return (
                        <div key={message._key} className={`shared-session-message ${fromOther ? 'shared-session-message--other' : 'shared-session-message--mine'}`}>
                            {senderLabel && <div className="shared-session-message-sender">{senderLabel}</div>}
                            <ChatMessage message={message} onExpandImage={openLightbox}/>
                        </div>
                    );
                })}

                {notice && <div className="chat-attachment-notice shared-sessions-notice--error" role="alert">{notice}</div>}

                <div aria-live="polite">
                    {conversation && attachmentTray.hasPendingUploads && (
                        <div className="chat-attachment-notice">Wait for uploads to finish.</div>
                    )}
                </div>

                {conversation && chatModel.modelNotice && (
                    <div className="chat-attachment-notice chat-model-notice" role="status">{chatModel.modelNotice}</div>
                )}

                {lightboxAttachment && (
                    <AttachmentLightbox attachment={lightboxAttachment} onClose={closeLightbox}/>
                )}

                {elicitation && !activeRun && (
                    <ElicitationPrompt
                        elicitation={elicitation}
                        values={promptValues}
                        onChange={handlePromptChange}
                        onSubmit={handlePromptSubmit}
                        submitting={sending}
                    />
                )}

                {takesMessages && conversation && (
                    <ChatInput
                        loading={composerLocked}
                        streamActive={viewerMayStop && !!activeRun}
                        onStopChat={handleCancel}
                        inputValue={inputValue}
                        handleInputChange={(event) => setInputValue(event.target.value)}
                        handleSubmit={handleConversationSubmit}
                        chatInputRef={composerInputRef}
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
                        placeholder={composerPlaceholder({activeRun, banner, otherName, agent, conversation})}
                        ariaLabel="Your message"
                        maxLength={MAXIMUM_CONVERSATION_MESSAGE_CHARACTERS}
                        attachmentsAloneSubmit
                        submitBlocked={attachmentTray.hasPendingUploads}
                    />
                )}

                {takesMessages && !conversation && (
                    <MessageComposer
                        inputRef={composerInputRef}
                        inputValue={inputValue}
                        onInputChange={(event) => setInputValue(event.target.value)}
                        onSubmit={handleSubmit}
                        canSubmit={!composerLocked && inputValue.trim().length > 0}
                        disabled={composerLocked}
                        placeholder={composerPlaceholder({activeRun, banner, otherName, agent, conversation})}
                        ariaLabel="Your message"
                        loading={sending || (!!activeRun && !myRunActive)}
                        onStop={viewerMayStop && myRunActive ? handleCancel : null}
                        showSend={!(viewerMayStop && myRunActive)}
                        containerRef={composerRef}
                    />
                )}
            </div>

            {addingPeople && (
                <AddPeopleDialog
                    sessionId={sessionId}
                    excludeUserIds={[...seatedIds, ...pendingInvitees.map((invitee) => invitee.userId)]}
                    maxPeople={seatsLeft}
                    onCancel={() => setAddingPeople(false)}
                    onInvited={(people) => {
                        setInvitedLocally({people: [...locallyInvited, ...people], session});
                        setAddingPeople(false);
                    }}
                />
            )}

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
};

const SharedSessionScreen = () => {
    const {sessionId} = useParams();

    return <SharedSessionScreenBody key={sessionId} sessionId={sessionId}/>;
};

export default SharedSessionScreen;
