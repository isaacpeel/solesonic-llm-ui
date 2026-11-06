import {useEffect, useMemo, useState} from 'react';
import {ChevronRightIcon} from '@heroicons/react/24/solid';

import './ChatHistory.css';
import ChatHistorySearchInput from './ChatHistorySearchInput.jsx';
import ChatSearchResultLabel from './ChatSearchResultLabel.jsx';
import ChatRowMenu from './ChatRowMenu.jsx';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import {groupChatsByDay} from '../../util/chatHistoryGrouping.js';
import {flattenSearchResultsToRows, CHAT_HISTORY_HEADER_ROW} from '../../util/chatHistoryRows.js';
import {normalizeSearchQuery, SEARCH_DEBOUNCE_MILLISECONDS} from '../../util/chatHistorySearch.js';

const SNIPPET_LEAD_CHARACTERS = 12;
const SNIPPET_LENGTH = 80;
const MOCK_LATENCY_MILLISECONDS = 400;

function hoursAgo(hours) {
    return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

const MOCK_CHATS = [
    {
        id: 'chat-1',
        name: null,
        timestamp: hoursAgo(1),
        chatMessages: [
            {id: 'message-1', messageType: 'USER', message: 'Can you help me set up the UniFi POE switch in the garage rack?'},
            {id: 'message-2', messageType: 'ASSISTANT', message: 'Sure. First adopt the switch in the UniFi controller, then assign a port profile for each POE device.'},
        ],
    },
    {
        id: 'chat-2',
        name: 'UniFi network rebuild',
        timestamp: hoursAgo(3),
        chatGroupId: 'group-home',
        chatMessages: [
            {id: 'message-3', messageType: 'USER', message: 'Plan the VLAN layout for cameras and IoT.'},
        ],
    },
    {
        id: 'chat-3',
        name: 'Sourdough schedule',
        timestamp: hoursAgo(28),
        chatMessages: [
            {id: 'message-4', messageType: 'USER', message: 'What time should I feed the starter for a Saturday bake?'},
            {id: 'message-5', messageType: 'ASSISTANT', message: 'Feed it Friday night around 9pm so it peaks by the morning; the unifying idea is to time the levain to your shaping window.'},
        ],
    },
    {
        id: 'chat-4',
        name: null,
        timestamp: hoursAgo(24 * 9),
        chatMessages: [
            {id: 'message-6', messageType: 'USER', message: 'Write a script that backs up the controller config every night'},
            {id: 'message-7', messageType: 'ASSISTANT', message: 'Here is a cron job that exports the UniFi controller backup to the NAS and keeps the last fourteen copies.'},
        ],
    },
    {
        id: 'chat-5',
        name: 'Trip planning — Banff',
        timestamp: hoursAgo(24 * 40),
        chatMessages: [
            {id: 'message-8', messageType: 'USER', message: 'Best hikes near Lake Louise in September?'},
        ],
    },
];

/* Stands in for the server: case-insensitive substring over name and messages, newest first. */
function mockSearch(chats, query) {
    const lowerQuery = query.toLowerCase();

    return chats
        .map((chat) => {
            const matchingMessage = chat.chatMessages.find(
                (chatMessage) => chatMessage.message.toLowerCase().includes(lowerQuery)
            );

            if (matchingMessage) {
                const hitIndex = matchingMessage.message.toLowerCase().indexOf(lowerQuery);
                const snippetStart = Math.max(0, hitIndex - SNIPPET_LEAD_CHARACTERS);
                const leadingEllipsis = snippetStart > 0 ? '…' : '';
                const body = matchingMessage.message.slice(snippetStart, snippetStart + SNIPPET_LENGTH);
                const trailingEllipsis = snippetStart + SNIPPET_LENGTH < matchingMessage.message.length ? '…' : '';

                return {
                    ...chat,
                    match: {
                        chatMessageId: matchingMessage.id,
                        messageType: matchingMessage.messageType,
                        timestamp: chat.timestamp,
                        snippet: `${leadingEllipsis}${body}${trailingEllipsis}`,
                        highlightStart: leadingEllipsis.length + hitIndex - snippetStart,
                        highlightLength: query.length,
                    },
                };
            }

            if ((chat.name ?? '').toLowerCase().includes(lowerQuery)) {
                return {...chat, match: null};
            }

            return null;
        })
        .filter(Boolean);
}

const noOpActions = [
    {key: 'rename', label: 'Rename', onSelect: () => {}},
    {key: 'delete', label: 'Delete', destructive: true, separatorBefore: true, onSelect: () => {}},
];

function ResultRows({rows, query}) {
    return rows.map((row) => {
        if (row.type === CHAT_HISTORY_HEADER_ROW) {
            return (
                <div
                    key={row.key}
                    className={row.firstInList
                        ? 'chat-history-header-row'
                        : 'chat-history-header-row chat-history-header-row-spaced'}
                >
                    <button type="button" className="date-header" aria-expanded="true">
                        <ChevronRightIcon aria-hidden="true" className="date-header-chevron date-header-chevron-expanded"/>
                        <span className="date-header-label">{row.label}</span>
                    </button>
                </div>
            );
        }

        return (
            <div key={row.key} className="chat-item chat-item-search-result" title={row.fullLabel}>
                <ChatSearchResultLabel label={row.label} match={row.match} query={query}/>
                <ChatRowMenu label={row.fullLabel} actions={noOpActions}/>
            </div>
        );
    });
}

function DrawerFrame({searchText, onSearchTextChange, children, status}) {
    return (
        <div style={{width: 250, height: 560, display: 'flex', flexDirection: 'column'}} className="bg-primary">
            <div className="chat-drawer">
                <h2>Chat History</h2>
                <ChatHistorySearchInput
                    value={searchText}
                    onChange={onSearchTextChange}
                    onClear={() => onSearchTextChange('')}
                />
                <div className="chat-history-scroll">{children}</div>
                <div className="chat-history-status-area">
                    {status && <div className="chat-history-status">{status}</div>}
                </div>
            </div>
        </div>
    );
}

function StaticResults({query, results, loading}) {
    const rows = useMemo(() => flattenSearchResultsToRows(groupChatsByDay(results)), [results]);
    const [searchText, setSearchText] = useState(query);

    return (
        <DrawerFrame
            searchText={searchText}
            onSearchTextChange={setSearchText}
            status={loading ? 'Searching…' : null}
        >
            <ResultRows rows={rows} query={query}/>
            {!loading && rows.length === 0 && <div className="chat-history-status">No matching chats.</div>}
        </DrawerFrame>
    );
}

function LiveSearchDrawer() {
    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MILLISECONDS);
    const searchQuery = normalizeSearchQuery(searchText) === null ? null : normalizeSearchQuery(debouncedSearchText);
    const [response, setResponse] = useState({query: null, results: []});

    useEffect(() => {
        if (searchQuery === null) {
            return;
        }

        const timeoutId = setTimeout(
            () => setResponse({query: searchQuery, results: mockSearch(MOCK_CHATS, searchQuery)}),
            MOCK_LATENCY_MILLISECONDS,
        );

        return () => {
            clearTimeout(timeoutId);
        };
    }, [searchQuery]);

    const listingRows = useMemo(
        () => flattenSearchResultsToRows(groupChatsByDay(MOCK_CHATS.filter((chat) => !chat.chatGroupId)))
            .map((row) => ({...row, match: null})),
        [],
    );

    const settled = searchQuery !== null && response.query === searchQuery;
    const searchRows = useMemo(
        () => (settled ? flattenSearchResultsToRows(groupChatsByDay(response.results)) : []),
        [settled, response],
    );

    const status = searchQuery !== null && !settled ? 'Searching…' : null;

    return (
        <DrawerFrame searchText={searchText} onSearchTextChange={setSearchText} status={status}>
            {searchQuery === null
                ? <ResultRows rows={listingRows} query={null}/>
                : <ResultRows rows={searchRows} query={searchQuery}/>}
            {settled && searchRows.length === 0 && (
                <div className="chat-history-status">No matching chats.</div>
            )}
        </DrawerFrame>
    );
}

export default {
    title: 'Chat/History/SearchResults',
    component: ChatSearchResultLabel,
};

export const MessageMatches = {
    render: () => <StaticResults query="unifi" results={mockSearch(MOCK_CHATS, 'unifi')}/>,
};

export const NameOnlyMatch = {
    render: () => <StaticResults query="banff" results={mockSearch(MOCK_CHATS, 'banff')}/>,
};

export const SubstringMatch = {
    render: () => <StaticResults query="unif" results={mockSearch(MOCK_CHATS, 'unif')}/>,
};

export const Searching = {
    render: () => <StaticResults query="sourdough" results={[]} loading/>,
};

export const NoResults = {
    render: () => <StaticResults query="kubernetes" results={[]}/>,
};

export const LiveSearch = {
    render: () => <LiveSearchDrawer/>,
};
