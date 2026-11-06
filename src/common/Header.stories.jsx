import {useEffect} from 'react';
import PropTypes from 'prop-types';
import {MemoryRouter} from 'react-router';
import Header from './Header.jsx';
import {useSharedData} from '../context/useSharedData.jsx';
import {KeycloakContext} from '../providers/KeycloakProvider.jsx';
import authService from '../service/AuthService.js';
import sharedSessionService from '../service/SharedSessionService.js';
import chatService from '../service/ChatService.js';
import chatGroupService from '../service/ChatGroupService.js';
import {PUSH_NAVIGATED_EVENT} from '../push/usePushNavigation.js';

function HeaderStoryWrapper({
    initialDrawerOpen = false,
    sessions = [],
    invites = [],
    username = 'Isaac',
}) {
    const {setDrawerOpen} = useSharedData();

    useEffect(() => {
        setDrawerOpen(initialDrawerOpen);
    }, [initialDrawerOpen, setDrawerOpen]);

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
        const originalSessions = sharedSessionService.sessions;
        const originalInvites = sharedSessionService.incomingInvites;
        const originalFindChatHistory = chatService.findChatHistory;
        const originalGetChatGroups = chatGroupService.getChatGroups;

        sharedSessionService.sessions = async () => sessions;
        sharedSessionService.incomingInvites = async () => invites;
        chatService.findChatHistory = async () => ({
            chats: [
                {
                    id: 'chat-1',
                    chatName: 'Recent conversation about React',
                    createDate: new Date().toISOString(),
                    updateDate: new Date().toISOString(),
                },
                {
                    id: 'chat-2',
                    chatName: 'Vite and Storybook setup questions',
                    createDate: new Date(Date.now() - 86400000).toISOString(),
                    updateDate: new Date(Date.now() - 86400000).toISOString(),
                },
            ],
            page: 0,
            last: true,
            totalElements: 2,
        });
        chatGroupService.getChatGroups = async () => [];

        window.dispatchEvent(new Event(PUSH_NAVIGATED_EVENT));

        return () => {
            sharedSessionService.sessions = originalSessions;
            sharedSessionService.incomingInvites = originalInvites;
            chatService.findChatHistory = originalFindChatHistory;
            chatGroupService.getChatGroups = originalGetChatGroups;
        };
    }, [sessions, invites]);

    return (
        <KeycloakContext.Provider
            value={{
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
            }}
        >
            <MemoryRouter>
                <div style={{minHeight: initialDrawerOpen ? 600 : 120, position: 'relative'}}>
                    <Header/>
                </div>
            </MemoryRouter>
        </KeycloakContext.Provider>
    );
}

HeaderStoryWrapper.propTypes = {
    initialDrawerOpen: PropTypes.bool,
    sessions: PropTypes.arrayOf(PropTypes.object),
    invites: PropTypes.arrayOf(PropTypes.object),
    username: PropTypes.string,
};

export default {
    title: 'Common/Header',
    component: Header,
    parameters: {
        layout: 'fullscreen',
    },
};

export const Default = {
    render: () => <HeaderStoryWrapper initialDrawerOpen={false}/>,
};

export const DrawerOpen = {
    render: () => <HeaderStoryWrapper initialDrawerOpen={true}/>,
};

export const WithSharedSessionWaiting = {
    render: () => (
        <HeaderStoryWrapper
            initialDrawerOpen={false}
            sessions={[{id: 'session-1', agentName: 'feud', yourTurn: true}]}
        />
    ),
};

export const WithUserMenuOpen = {
    render: () => <HeaderStoryWrapper initialDrawerOpen={false} username="Isaac"/>,
    play: async ({canvasElement}) => {
        const userButton = canvasElement.querySelector('.icon-wrapper[data-dialog="User Options"]');
        userButton?.click();
    },
};
