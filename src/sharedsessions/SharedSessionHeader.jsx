import {useState} from 'react';
import {Link} from 'react-router';
import {
    ArrowRightStartOnRectangleIcon,
    ChevronLeftIcon,
    NoSymbolIcon,
    UserPlusIcon,
} from '@heroicons/react/20/solid';
import ChatHeader, {ChatHeaderMenu} from '../chat/header/ChatHeader.jsx';
import './SharedSessionHeader.css';

const VISIBLE_AVATARS = 3;

const AVATAR_HUES = [222, 18, 160, 280, 40, 340, 195, 100];

function initialOf(name) {
    return (name ?? '?').trim().charAt(0).toUpperCase() || '?';
}

function hueFor(userId) {
    const text = String(userId ?? '');
    let hash = 0;

    for (let index = 0; index < text.length; index++) {
        hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }

    return AVATAR_HUES[hash % AVATAR_HUES.length];
}

function countLabel(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural}`;
}

function subtitleFor({conversation, session, activeRun, connected, participants, pendingInvitees}) {
    if (!connected) {
        return {text: 'Reconnecting…', busy: false};
    }

    if (!conversation) {
        return {text: participants.map((participant) => participant.name).join(', '), busy: !!activeRun};
    }

    if (session.status === 'CLOSED') {
        return {text: 'Ended · read only', busy: false};
    }

    if (session.status === 'EXPIRED') {
        return {text: 'Expired · read only', busy: false};
    }

    if (activeRun) {
        return {text: 'Assistant is responding…', busy: true};
    }

    const people = countLabel(participants.length, 'person', 'people');

    return {text: pendingInvitees.length > 0 ? `${people} · ${pendingInvitees.length} invited` : people, busy: false};
}

function Avatar({userId, name, pending = false}) {
    return (
        <span
            className={`shared-header-avatar${pending ? ' shared-header-avatar--pending' : ''}`}
            style={pending ? undefined : {'--avatar-hue': hueFor(userId)}}
            aria-hidden="true"
        >
            {initialOf(name)}
        </span>
    );
}

function AvatarStack({participants}) {
    const shown = participants.slice(0, VISIBLE_AVATARS);
    const hidden = participants.length - shown.length;

    return (
        <div className="shared-header-avatars" aria-hidden="true">
            {shown.map((participant) => <Avatar key={participant.userId} userId={participant.userId} name={participant.name}/>)}
            {hidden > 0 && <span className="shared-header-avatar shared-header-avatar--more">+{hidden}</span>}
        </div>
    );
}

function SharedSessionHeader({
    title,
    conversation,
    session,
    activeRun,
    connected,
    participants,
    pendingInvitees,
    viewerUserId,
    canAddPeople,
    seatsLeft,
    onAddPeople,
    leaveCopy,
    onLeave,
}) {
    const [confirmingLeave, setConfirmingLeave] = useState(false);
    const [leaving, setLeaving] = useState(false);

    const subtitle = subtitleFor({conversation, session, activeRun, connected, participants, pendingInvitees});
    const full = seatsLeft <= 0;

    const handleConfirmLeave = async (close) => {
        setLeaving(true);

        try {
            await onLeave();
        } finally {
            setLeaving(false);
            close();
        }
    };

    return (
        <ChatHeader
            className="shared-session-header"
            leading={(
                <Link to="/shared-sessions" className="chat-header-icon-button" aria-label="Back to shared chats" title="Back to shared chats">
                    <ChevronLeftIcon aria-hidden="true"/>
                </Link>
            )}
            title={title}
            subtitle={subtitle.text}
            busy={subtitle.busy}
            trailing={<AvatarStack participants={participants}/>}
        >
            <ChatHeaderMenu locked={leaving} focusKey={confirmingLeave} onClose={() => setConfirmingLeave(false)}>
                {({close}) => (confirmingLeave && leaveCopy ? (
                    <div className="chat-header-confirm">
                        <p className="chat-header-confirm-text">{leaveCopy.confirmText}</p>
                        <div className="chat-header-confirm-actions">
                            <button type="button" className="chat-header-action" onClick={() => setConfirmingLeave(false)} disabled={leaving}>
                                {leaveCopy.keepLabel}
                            </button>
                            <button
                                type="button"
                                className="chat-header-action chat-header-action--confirm"
                                onClick={() => handleConfirmLeave(close)}
                                disabled={leaving}
                            >
                                {leaveCopy.confirmLabel}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="chat-header-section-label">
                            {`People · ${participants.length + pendingInvitees.length}`}
                        </div>
                        <ul className="shared-session-people">
                            {participants.map((participant) => (
                                <li key={participant.userId} className="shared-session-person">
                                    <Avatar userId={participant.userId} name={participant.name}/>
                                    <span className="shared-session-person-name">{participant.name}</span>
                                    {participant.userId === viewerUserId && <span className="shared-session-person-note">You</span>}
                                    {conversation && participant.userId !== viewerUserId && participant.userId === session.ownerUserId && (
                                        <span className="shared-session-person-note">Owner</span>
                                    )}
                                </li>
                            ))}
                            {pendingInvitees.map((invitee) => (
                                <li
                                    key={invitee.userId}
                                    className="shared-session-person shared-session-person--pending"
                                    title={invitee.displayName || invitee.username}
                                >
                                    <Avatar name={invitee.username} pending/>
                                    <span className="shared-session-person-name">{invitee.username}</span>
                                    <span className="shared-session-person-note">Invited</span>
                                </li>
                            ))}
                        </ul>

                        {(canAddPeople || leaveCopy) && <div className="chat-header-divider"/>}

                        {canAddPeople && (
                            <button
                                type="button"
                                className="chat-header-action"
                                onClick={() => {
                                    close({returnFocus: true});
                                    onAddPeople();
                                }}
                                disabled={full}
                                title={full ? 'This chat is full.' : undefined}
                            >
                                <UserPlusIcon aria-hidden="true"/>
                                <span>Add people</span>
                                <span className="chat-header-action-hint" aria-hidden="true">
                                    {full ? 'Full' : `${countLabel(seatsLeft, 'seat', 'seats')} left`}
                                </span>
                            </button>
                        )}

                        {leaveCopy && (
                            <button type="button" className="chat-header-action chat-header-action--danger" onClick={() => setConfirmingLeave(true)}>
                                {leaveCopy.endsForEveryone
                                    ? <NoSymbolIcon aria-hidden="true"/>
                                    : <ArrowRightStartOnRectangleIcon aria-hidden="true"/>}
                                <span>{leaveCopy.triggerLabel}</span>
                            </button>
                        )}
                    </>
                ))}
            </ChatHeaderMenu>
        </ChatHeader>
    );
}

export default SharedSessionHeader;
