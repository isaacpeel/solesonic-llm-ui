import {participantLabel, participantSummary} from '../util/sharedChats.js';
import './SharedChatMarkers.css';

function SharedChatMarkers({participants}) {
    const {shown, overflow} = participantSummary(participants);

    return (
        <>
            <span className="chat-item-shared-badge" aria-label="Shared chat">Shared</span>

            {shown.length > 0 && (
                <span className="chat-item-participants" role="img" aria-label={participantLabel(participants)}>
                    {shown.map((person) => (
                        <span key={person.userId} className="chat-item-participant" title={person.name} aria-hidden="true">
                            {person.initials}
                        </span>
                    ))}
                    {overflow > 0 && <span className="chat-item-participant-overflow" aria-hidden="true">+{overflow}</span>}
                </span>
            )}
        </>
    );
}

export default SharedChatMarkers;
