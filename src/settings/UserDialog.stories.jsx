import {useEffect} from 'react';
import PropTypes from 'prop-types';
import {MemoryRouter} from 'react-router';
import UserDialog from './UserDialog.jsx';
import {KeycloakContext} from '../providers/KeycloakProvider.jsx';
import authService from '../service/AuthService.js';

function MockKeycloakContext({children, username = 'Isaac'}) {
    useEffect(() => {
        authService.setKeycloakInstance({
            tokenParsed: {
                given_name: username,
                username,
                sub: 'user-1',
            },
        });
    }, [username]);

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
                <div style={{minHeight: 220, padding: 20, display: 'flex', justifyContent: 'flex-end'}}>
                    {children}
                </div>
            </MemoryRouter>
        </KeycloakContext.Provider>
    );
}

MockKeycloakContext.propTypes = {
    children: PropTypes.node,
    username: PropTypes.string,
};

export default {
    title: 'Settings/UserDialog',
    component: UserDialog,
    decorators: [
        (Story, context) => (
            <MockKeycloakContext username={context.args?.username ?? 'Isaac'}>
                <Story/>
            </MockKeycloakContext>
        ),
    ],
};

export const Closed = {
    args: {
        username: 'Isaac',
    },
};

export const Open = {
    args: {
        username: 'Isaac',
    },
    play: async ({canvasElement}) => {
        const button = canvasElement.querySelector('.icon-wrapper');
        button?.click();
    },
};

export const LongUsername = {
    args: {
        username: 'alexander.hamilton.developer@company.internal',
    },
    play: async ({canvasElement}) => {
        const button = canvasElement.querySelector('.icon-wrapper');
        button?.click();
    },
};
