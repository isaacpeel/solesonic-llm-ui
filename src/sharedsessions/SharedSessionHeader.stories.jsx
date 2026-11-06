import {MemoryRouter} from 'react-router';
import SharedSessionHeader from './SharedSessionHeader.jsx';
import './SharedSessions.css';

const OWNER = 'user-isaac';

const SESSION = {
    id: 'session-1',
    mode: 'CONVERSATION',
    name: 'Layoffs at Spectrum',
    status: 'ACTIVE',
    ownerUserId: OWNER,
};

const PARTICIPANTS = [
    {userId: OWNER, name: 'Isaac'},
    {userId: 'user-maya', name: 'Maya'},
    {userId: 'user-jordan', name: 'Jordan'},
];

const PENDING = [{userId: 'user-sam', username: 'sam', displayName: 'Sam Ortiz'}];

const OWNER_LEAVE = {
    triggerLabel: 'End sharing for everyone',
    confirmText: 'End sharing for everyone?',
    confirmLabel: 'End sharing for everyone',
    keepLabel: 'Keep sharing',
    endsForEveryone: true,
};

const MEMBER_LEAVE = {
    triggerLabel: 'Leave chat',
    confirmText: 'Leave this chat?',
    confirmLabel: 'Leave chat',
    keepLabel: 'Stay in the chat',
    endsForEveryone: false,
};

export default {
    title: 'Shared sessions/SharedSessionHeader',
    component: SharedSessionHeader,
    parameters: {layout: 'fullscreen'},
    decorators: [
        (Story) => (
            <MemoryRouter>
                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 420, padding: 8}}>
                    <Story/>
                </div>
            </MemoryRouter>
        ),
    ],
    args: {
        title: SESSION.name,
        conversation: true,
        session: SESSION,
        activeRun: null,
        connected: true,
        participants: PARTICIPANTS,
        pendingInvitees: PENDING,
        viewerUserId: OWNER,
        canAddPeople: true,
        seatsLeft: 4,
        onAddPeople: () => {},
        leaveCopy: OWNER_LEAVE,
        onLeave: async () => {},
    },
};

export const Idle = {};

export const Responding = {args: {activeRun: {runId: 'run-1'}}};

export const Ended = {args: {session: {...SESSION, status: 'CLOSED'}, canAddPeople: false, leaveCopy: null}};

export const Reconnecting = {args: {connected: false}};

export const Participant = {args: {viewerUserId: 'user-maya', canAddPeople: false, leaveCopy: MEMBER_LEAVE}};

export const ManyPeople = {
    args: {
        title: 'Quarterly planning for the platform team offsite',
        participants: [...PARTICIPANTS, {userId: 'u-4', name: 'Priya'}, {userId: 'u-5', name: 'Leo'}],
        pendingInvitees: [],
        seatsLeft: 0,
    },
};
