import {useState, useEffect, useRef} from 'react';
import PropTypes from 'prop-types';
import {MemoryRouter, Route, Routes} from 'react-router';
import ChatScreen from './ChatScreen.jsx';
import Header from '../common/Header.jsx';
import '../App.css';
import {SharedDataContext} from '../context/SharedDataContext.jsx';
import {ChatTurnContext} from '../context/ChatTurnContext.jsx';
import {KeycloakContext} from '../providers/KeycloakProvider.jsx';
import authService from '../service/AuthService.js';
import sharedSessionService from '../service/SharedSessionService.js';
import chatGroupService from '../service/ChatGroupService.js';
import chatService from '../service/ChatService.js';
import chatModelService from '../service/ChatModelService.js';
import interestService from '../service/InterestService.js';
import slashCommandService from '../service/SlashCommandService.js';

const SAMPLE_MODELS = [
    {id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', displayName: 'Claude 3.5 Sonnet'},
    {id: 'openai.gpt-4o', displayName: 'GPT-4o'},
    {id: 'anthropic.claude-3-haiku-20240307-v1:0', displayName: 'Claude 3 Haiku'},
    {id: 'meta.llama3-70b-instruct-v1:0', displayName: 'Llama 3 70B'},
];

const SAMPLE_SLASH_COMMANDS = [
    {command: 'clear', name: 'clear', description: 'Clear conversation history'},
    {command: 'model', name: 'model', description: 'Switch active model'},
    {command: 'logs', name: 'logs', description: 'Analyze system logs and errors'},
    {command: 'search', name: 'search', description: 'Perform web search'},
];

const CHAT_REGISTRY = new Map();
const NEWS_UPDATE_REGISTRY = new Map();
const PENDING_OFFERS_REGISTRY = new Map();

CHAT_REGISTRY.set('chat-101', {
    id: 'chat-101',
    name: 'Optimizing Vite and React Build Performance',
    chatMessages: [
        {
            messageType: 'USER',
            message: 'How can I optimize our Vite build config for faster CI builds and smaller chunk sizes?',
        },
        {
            messageType: 'ASSISTANT',
            message: 'Here are the key strategies to optimize your Vite build pipeline:\n\n### 1. Manual Chunk Splitting\nSplit vendor libraries that do not change often:\n\n```javascript\n// vite.config.js\nexport default defineConfig({\n  build: {\n    rollupOptions: {\n      output: {\n        manualChunks: {\n          vendor: [\'react\', \'react-dom\', \'react-router\'],\n        },\n      },\n    },\n  },\n});\n```\n\n### 2. Dependency Pre-bundling & Cache\nEnsure `node_modules/.vite` is cached in your CI workflow.\n\n### 3. Tree Shaking & Minification\nUse esbuild minification for fast builds or Terser for maximal compression.',
            model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
            responseMetadata: {
                tokensPerSecond: 134.8,
                totalTokens: 420,
            },
        },
        {
            messageType: 'USER',
            message: 'What about dynamic imports for code splitting on routes?',
        },
        {
            messageType: 'ASSISTANT',
            message: 'Dynamic imports with `React.lazy()` or router-level lazy loading ensure each route is loaded on demand:\n\n```jsx\nconst SettingsView = React.lazy(() => import(\'./SettingsView\'));\n```\n\nThis immediately reduces initial bundle size for new visitors.',
            model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
            responseMetadata: {
                tokensPerSecond: 142.1,
                totalTokens: 198,
            },
        },
    ],
});

CHAT_REGISTRY.set('chat-102', {
    id: 'chat-102',
    name: 'Refactoring Architecture',
    chatMessages: [
        {
            messageType: 'USER',
            message: 'Can you analyze our state management flow and suggest refactoring?',
        },
        {
            messageType: 'ASSISTANT',
            message: 'I am analyzing the context providers across the repository…',
            model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        },
    ],
});

CHAT_REGISTRY.set('chat-103', {
    id: 'chat-103',
    name: 'Denver Tech Market Research',
    chatMessages: [
        {
            messageType: 'USER',
            message: 'Find recent tech startup hiring data in Denver.',
        },
        {
            messageType: 'ASSISTANT',
            message: 'Here is what I gathered from the latest regional tech job indices in Denver:',
            model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
            responseMetadata: {
                tokensPerSecond: 98.4,
                totalTokens: 310,
            },
            activity: [
                {
                    toolCallId: 'tool-search-1',
                    name: 'web_search',
                    arguments: '{"query": "Denver startup tech hiring 2026"}',
                    status: 'ok',
                    durationMs: 1420,
                },
                {
                    toolCallId: 'tool-fetch-2',
                    name: 'fetch_webpage',
                    arguments: '{"url": "https://coloradotech.org/jobs-report"}',
                    status: 'ok',
                    durationMs: 890,
                },
            ],
        },
    ],
});

CHAT_REGISTRY.set('chat-104', {
    id: 'chat-104',
    name: 'Deploy Production Pipeline',
    chatMessages: [
        {
            messageType: 'USER',
            message: 'Trigger the production deploy workflow.',
        },
    ],
});

CHAT_REGISTRY.set('chat-105', {
    id: 'chat-105',
    name: 'Network Connection Interrupted',
    chatMessages: [
        {
            messageType: 'USER',
            message: 'Explain event loops in JavaScript.',
        },
    ],
});

CHAT_REGISTRY.set('chat-106', {
    id: 'chat-106',
    name: 'Document Analysis',
    chatMessages: [
        {
            messageType: 'USER',
            message: 'Analyze the attached architectural diagram.',
        },
    ],
});

CHAT_REGISTRY.set('chat-107', {
    id: 'chat-107',
    name: 'Audio Cue Notification',
    chatMessages: [
        {
            messageType: 'USER',
            message: 'Play the test sound when finished.',
        },
        {
            messageType: 'ASSISTANT',
            message: 'Response completed.',
            model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        },
    ],
});

CHAT_REGISTRY.set('chat-108', {
    id: 'chat-108',
    name: 'Database Migration Query',
    chatMessages: [
        {
            messageType: 'USER',
            message: 'Can you generate the SQL migration script for adding tenant partitioning?',
        },
        {
            messageType: 'ASSISTANT',
            message: 'The model backend timed out while generating the response. Please try again.',
            timestamp: '2026-11-06T07:10:00.000Z',
            progressData: {
                code: 'timeout',
                message: 'The model backend timed out while generating the response. Please try again.',
                occurredAt: '2026-11-06T07:10:00.000Z',
            },
        },
    ],
});

CHAT_REGISTRY.set('chat-109', {
    id: 'chat-109',
    name: 'Microservice Deployment Debugging',
    chatMessages: [
        {
            messageType: 'USER',
            message: 'Fetch and parse the pod logs from the payments cluster.',
        },
        {
            messageType: 'ASSISTANT',
            message: 'An unexpected internal error occurred while connecting to the kubernetes provider.',
            timestamp: '2026-11-06T07:12:00.000Z',
            progressData: {
                code: 'internal',
                message: 'An unexpected internal error occurred while connecting to the kubernetes provider.',
                occurredAt: '2026-11-06T07:12:00.000Z',
            },
        },
    ],
});

NEWS_UPDATE_REGISTRY.set('chat-101', {
    agentId: 'news-briefing-1',
    label: 'Daily Tech Briefing',
    itemCount: 3,
});

const MOCK_CHAT_HISTORY = [
    {
        id: 'chat-101',
        chatName: 'Optimizing Vite and React Build Performance',
        createDate: new Date().toISOString(),
        updateDate: new Date().toISOString(),
    },
    {
        id: 'chat-103',
        chatName: 'Denver Tech Market Research',
        createDate: new Date(Date.now() - 86400000).toISOString(),
        updateDate: new Date(Date.now() - 86400000).toISOString(),
    },
    {
        id: 'chat-108',
        chatName: 'Database Migration Query',
        createDate: new Date(Date.now() - 172800000).toISOString(),
        updateDate: new Date(Date.now() - 172800000).toISOString(),
    },
];

chatService.findChatHistory = async ({search, page = 0} = {}) => {
    let chats = MOCK_CHAT_HISTORY;
    if (search) {
        chats = chats.filter((c) => c.chatName.toLowerCase().includes(search.toLowerCase()));
    }
    return {
        chats,
        page,
        last: true,
        totalElements: chats.length,
    };
};

chatGroupService.getChatGroups = async () => [];
sharedSessionService.sessions = async () => [];
sharedSessionService.incomingInvites = async () => [];
authService.getUserId = async () => 'user-1';
authService.setKeycloakInstance({
    tokenParsed: {
        given_name: 'Isaac',
        username: 'Isaac',
        sub: 'user-1',
    },
});

chatService.findChatDetails = async (id) => {
    if (CHAT_REGISTRY.has(id)) {
        return CHAT_REGISTRY.get(id);
    }
    return {
        id,
        name: 'Sample Conversation',
        chatMessages: [],
    };
};

chatService.renameChat = async (id, name) => {
    const existing = CHAT_REGISTRY.get(id);
    if (existing) {
        existing.name = name;
    }
    return {id, name};
};

chatModelService.options = async () => ({
    models: SAMPLE_MODELS,
    defaultModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    selectedModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
});

slashCommandService.fetchCommands = async (prefix) => {
    if (!prefix) return SAMPLE_SLASH_COMMANDS;
    return SAMPLE_SLASH_COMMANDS.filter((c) => c.name.toLowerCase().startsWith(prefix.toLowerCase()));
};

interestService.getUpdateForChat = async (chatId) => {
    return NEWS_UPDATE_REGISTRY.get(chatId) ?? null;
};

interestService.getPendingOffers = async () => {
    return PENDING_OFFERS_REGISTRY.get('active') ?? [];
};

function createMockChatTurn({
    turnInProgress = false,
    streamActive = false,
    inputValue = '',
    attachmentNotice = null,
    recoveryFailed = false,
    activeElicitation = null,
    elicitationValues = {},
    elicitationSubmitting = false,
    blockedSound = null,
    onInputChange = () => {},
    onSubmit = async () => true,
    onStopChat = () => {},
    onRetryRecovery = () => {},
    onSendCommandTurn = async () => {},
    onAttachIfInFlight = () => {},
} = {}) {
    const getSelectedCommandRef = {current: () => null};
    const getMessageTextRef = {current: () => inputValue.trim()};
    const adoptedChatIdRef = {current: null};

    const soundPlayer = {
        attachSoundSurface: () => {},
        dismissBlockedSound: () => {},
        unlockSoundPlayer: () => {},
        blockedSound,
        playBlockedSound: () => {},
        playSound: () => {},
        stopSound: () => {},
    };

    return {
        turnInProgress,
        streamActive,
        inputValue,
        setInputValue: () => {},
        handleInputChange: onInputChange,
        handleStreamChunk: () => {},
        attachmentNotice,
        recoveryFailed,
        retryRecovery: onRetryRecovery,
        stopChat: onStopChat,
        activeElicitation,
        setActiveElicitation: () => {},
        elicitationValues,
        setElicitationValues: () => {},
        elicitationSubmitting,
        setElicitationSubmitting: () => {},
        getSelectedCommandRef,
        getMessageTextRef,
        soundPlayer,
        handleSubmit: onSubmit,
        sendCommandTurn: onSendCommandTurn,
        attachIfInFlight: onAttachIfInFlight,
        adoptedChatIdRef,
    };
}

function ChatScreenStoryHarness({
    initialRoute = '/',
    chatDetails = null,
    chatTurnOverrides = {},
    newsUpdate = null,
    pendingOffers = [],
    showHeader = true,
    initialDrawerOpen = false,
    username = 'Isaac',
}) {
    const [headerActionsElement, setHeaderActionsElement] = useState(null);
    const [chatHistory, setChatHistory] = useState([]);
    const [chatId, setChatId] = useState(null);
    const [drawerOpen, setDrawerOpen] = useState(initialDrawerOpen);
    const [reloadHistoryTrigger, setReloadHistoryTrigger] = useState(0);
    const [streamingChatId, setStreamingChatId] = useState(null);
    const chatInputRef = useRef(null);
    const adoptedChatIdRef = useRef(null);

    useEffect(() => {
        authService.setKeycloakInstance({
            tokenParsed: {
                given_name: username,
                username,
                sub: 'user-1',
            },
        });
    }, [username]);

    useEffect(() => {
        if (chatDetails?.id) {
            CHAT_REGISTRY.set(chatDetails.id, chatDetails);
        }
        if (chatDetails?.id && newsUpdate) {
            NEWS_UPDATE_REGISTRY.set(chatDetails.id, newsUpdate);
        }
        PENDING_OFFERS_REGISTRY.set('active', pendingOffers);
    }, [chatDetails, newsUpdate, pendingOffers]);

    const mockChatTurn = createMockChatTurn(chatTurnOverrides);

    const keycloakValue = {
        keycloak: {
            tokenParsed: {
                given_name: username,
                username,
                sub: 'user-1',
            },
            logout: () => {},
        },
        authenticated: true,
        loading: false,
        user: {given_name: username, username},
        logout: () => {},
        getToken: () => 'mock-token',
        hasRole: () => false,
        hasGroup: () => false,
    };

    return (
        <KeycloakContext.Provider value={keycloakValue}>
            <MemoryRouter initialEntries={[initialRoute]}>
                <SharedDataContext.Provider value={{
                    chatHistory,
                    setChatHistory,
                    chatId,
                    setChatId,
                    drawerOpen,
                    setDrawerOpen,
                    reloadHistoryTrigger,
                    setReloadHistoryTrigger,
                    streamingChatId,
                    setStreamingChatId,
                    headerActionsElement,
                    setHeaderActionsElement,
                    chatInputRef,
                    adoptedChatIdRef,
                }}>
                    <ChatTurnContext.Provider value={mockChatTurn}>
                        <div style={{minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--background-color, #1e1e1e)', color: 'var(--text-color, #fff)'}}>
                            {showHeader && <Header/>}
                            <div className={showHeader ? 'app-layout-content' : undefined} style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
                                <main style={{flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column'}}>
                                    <Routes>
                                        <Route path="/" element={<ChatScreen/>}/>
                                        <Route path="/chat/:chatId" element={<ChatScreen/>}/>
                                    </Routes>
                                </main>
                            </div>
                        </div>
                    </ChatTurnContext.Provider>
                </SharedDataContext.Provider>
            </MemoryRouter>
        </KeycloakContext.Provider>
    );
}

ChatScreenStoryHarness.propTypes = {
    initialRoute: PropTypes.string,
    chatDetails: PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string,
        chatMessages: PropTypes.arrayOf(PropTypes.shape({
            messageType: PropTypes.string.isRequired,
            message: PropTypes.string.isRequired,
            model: PropTypes.string,
            responseMetadata: PropTypes.object,
            activity: PropTypes.array,
            progressData: PropTypes.object,
        })),
    }),
    chatTurnOverrides: PropTypes.object,
    newsUpdate: PropTypes.shape({
        agentId: PropTypes.string,
        label: PropTypes.string,
        itemCount: PropTypes.number,
    }),
    pendingOffers: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
    })),
    showHeader: PropTypes.bool,
    initialDrawerOpen: PropTypes.bool,
    username: PropTypes.string,
};

export default {
    title: 'Chat/ChatScreen',
    component: ChatScreen,
    parameters: {
        layout: 'fullscreen',
    },
};

export const LoggedInInitialView = {
    render: () => <ChatScreenStoryHarness initialRoute="/" username="Isaac"/>,
};

export const NewConversation = {
    render: () => <ChatScreenStoryHarness initialRoute="/"/>,
};

export const LoggedInWithDrawerOpen = {
    render: () => <ChatScreenStoryHarness initialRoute="/" initialDrawerOpen={true} username="Isaac"/>,
};

export const NewConversationWithInterestOffer = {
    render: () => (
        <ChatScreenStoryHarness
            initialRoute="/"
            pendingOffers={[
                {id: 'k8s-132-offer', label: 'Kubernetes 1.32 Release and Migration Notes'},
            ]}
        />
    ),
};

export const ActiveConversation = {
    render: () => <ChatScreenStoryHarness initialRoute="/chat/chat-101"/>,
};

export const TurnInProgressStreaming = {
    render: () => (
        <ChatScreenStoryHarness
            initialRoute="/chat/chat-102"
            chatTurnOverrides={{
                turnInProgress: true,
                streamActive: true,
            }}
        />
    ),
};

export const WithToolActivity = {
    render: () => <ChatScreenStoryHarness initialRoute="/chat/chat-103"/>,
};

export const WithElicitationPrompt = {
    render: () => (
        <ChatScreenStoryHarness
            initialRoute="/chat/chat-104"
            chatTurnOverrides={{
                turnInProgress: true,
                activeElicitation: {
                    elicitationId: 'deploy-confirm-1',
                    chatId: 'chat-104',
                    message: 'Please select target cluster environment and confirm deploy:',
                    requestedSchema: {
                        properties: {
                            cluster: {
                                type: 'string',
                                title: 'Cluster',
                                enum: ['us-east-prod', 'us-west-prod', 'eu-central-prod'],
                            },
                        },
                    },
                },
                elicitationValues: {cluster: 'us-east-prod'},
            }}
        />
    ),
};

export const WithBotError = {
    render: () => <ChatScreenStoryHarness initialRoute="/chat/chat-108"/>,
};

export const WithAnalyzableBotError = {
    render: () => <ChatScreenStoryHarness initialRoute="/chat/chat-109"/>,
};

export const WithRecoveryNotice = {
    render: () => (
        <ChatScreenStoryHarness
            initialRoute="/chat/chat-105"
            chatTurnOverrides={{
                recoveryFailed: true,
            }}
        />
    ),
};

export const WithAttachmentNotice = {
    render: () => (
        <ChatScreenStoryHarness
            initialRoute="/chat/chat-106"
            chatTurnOverrides={{
                attachmentNotice: '2 image attachments uploaded and processed.',
            }}
        />
    ),
};

export const WithBlockedSound = {
    render: () => (
        <ChatScreenStoryHarness
            initialRoute="/chat/chat-107"
            chatTurnOverrides={{
                blockedSound: {
                    soundId: 'sound-alert-1',
                },
            }}
        />
    ),
};
