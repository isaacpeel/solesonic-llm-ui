import {useState} from 'react';
import ChatHistorySearchInput from './ChatHistorySearchInput.jsx';

function DrawerWidth({children}) {
    return (
        <div style={{width: 250, padding: 20, boxSizing: 'border-box', backgroundColor: 'var(--primary-color)'}}>
            {children}
        </div>
    );
}

function InteractiveSearchInput({initialValue}) {
    const [value, setValue] = useState(initialValue);

    return (
        <ChatHistorySearchInput value={value} onChange={setValue} onClear={() => setValue('')}/>
    );
}

export default {
    title: 'Chat/History/SearchInput',
    component: ChatHistorySearchInput,
    decorators: [(Story) => <DrawerWidth><Story/></DrawerWidth>],
};

export const Empty = {
    render: () => <InteractiveSearchInput initialValue=""/>,
};

export const WithQuery = {
    render: () => <InteractiveSearchInput initialValue="unifi"/>,
};

export const LongQuery = {
    render: () => <InteractiveSearchInput initialValue="how do I configure the poe budget on the switch"/>,
};
