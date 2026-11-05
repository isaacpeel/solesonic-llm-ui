import {useState} from 'react';
import UserMultiSelect from './UserMultiSelect.jsx';

const DIRECTORY = [
    {userId: 'u-1', username: 'alice', displayName: 'Alice Anders'},
    {userId: 'u-2', username: 'bob', displayName: 'Bob Brown'},
    {userId: 'u-3', username: 'carol', displayName: 'Carol Chan'},
    {userId: 'u-4', username: 'dave', displayName: 'Dave Peel'},
    {userId: 'u-5', username: 'diana', displayName: 'Diana R.'},
];

function mockDirectory(query) {
    const wanted = query.trim().toLowerCase();

    return Promise.resolve(DIRECTORY.filter((user) => user.username.startsWith(wanted)
        || user.displayName.toLowerCase().includes(wanted)));
}

const neverAnswers = (query, {signal}) => new Promise((resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
});

function Interactive({initial = [], ...props}) {
    const [value, setValue] = useState(initial);

    return (
        <div style={{width: 420, minHeight: 320}}>
            <UserMultiSelect value={value} onChange={setValue} searchUsers={mockDirectory} {...props}/>
        </div>
    );
}

export default {
    title: 'Common/UserMultiSelect',
    component: UserMultiSelect,
};

export const Empty = {
    render: () => <Interactive/>,
};

export const SeveralSelected = {
    render: () => <Interactive initial={DIRECTORY.slice(0, 3)}/>,
};

export const MaxReached = {
    render: () => <Interactive initial={DIRECTORY.slice(0, 3)} max={3}/>,
};

export const InvalidChip = {
    render: () => <Interactive initial={DIRECTORY.slice(0, 2)} invalidUsernames={['bob']}/>,
};

export const Loading = {
    render: () => <Interactive searchUsers={neverAnswers}/>,
};

export const ExcludingSeatedPeople = {
    render: () => <Interactive excludeUserIds={['u-1', 'u-2']}/>,
};

export const Disabled = {
    render: () => <Interactive initial={DIRECTORY.slice(0, 2)} disabled/>,
};
