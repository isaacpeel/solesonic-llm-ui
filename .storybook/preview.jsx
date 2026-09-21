import '../src/main.css';
import '../src/App.css';
import MockDate from 'mockdate';
import { mswLoader } from 'msw-storybook-addon/csf3';
import { MemoryRouter, Route, Routes } from 'react-router';
import { mswHandlers } from './msw-handlers';
import { KeycloakContext } from '../src/providers/KeycloakProvider.jsx';
import { SharedDataProvider } from '../src/context/SharedDataContext.jsx';
import authService from '../src/service/AuthService.js';

/*
 * The real KeycloakProvider does a live OIDC login-required redirect on mount, which has no
 * server to talk to here. This is a stand-in keycloak-js instance with the same shape, fed to
 * the real AuthService singleton and the real KeycloakContext — every component downstream
 * (useKeycloak, apiClient, chatService, etc.) reads it exactly as it would the genuine one.
 */
const STORYBOOK_KEYCLOAK_USER = {
  sub: 'storybook-user',
  given_name: 'Story',
  username: 'storybook-user',
  roles: ['user', 'admin'],
};

const storybookKeycloakInstance = {
  token: 'storybook-stub-token',
  tokenParsed: STORYBOOK_KEYCLOAK_USER,
  updateToken: () => Promise.resolve(true),
  loadUserProfile: () => Promise.resolve({ username: STORYBOOK_KEYCLOAK_USER.username }),
};

authService.setKeycloakInstance(storybookKeycloakInstance);

const storybookKeycloakContextValue = {
  keycloak: storybookKeycloakInstance,
  authenticated: true,
  loading: false,
  user: STORYBOOK_KEYCLOAK_USER,
  login: () => {},
  logout: () => {},
  getToken: () => storybookKeycloakInstance.token,
  hasRole: (roleName) => STORYBOOK_KEYCLOAK_USER.roles.includes(roleName),
};

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: "todo"
    },

    backgrounds: {
      default: 'app-dark',
      values: [
        {name: 'app-dark', value: '#1e1e1e'},
      ],
    },
  },
  decorators: [
    (Story, context) => {
      /*
       * Most stories don't care what the URL is — path="*" always matches. A story whose
       * component reads useParams() (e.g. RagManagement's :level) sets
       * `parameters.router = {initialEntries, path}` to get real route matching instead.
       */
      const { initialEntries = ['/'], path = '*' } = context.parameters.router ?? {};

      return (
        <KeycloakContext.Provider value={storybookKeycloakContextValue}>
          <SharedDataProvider>
            <MemoryRouter initialEntries={initialEntries}>
              <Routes>
                <Route path={path} element={<Story />} />
              </Routes>
            </MemoryRouter>
          </SharedDataProvider>
        </KeycloakContext.Provider>
      );
    },
  ],
  loaders: [mswLoader()],
  async beforeEach({ msw }) {
    msw.use(...mswHandlers);
    // Fixes "now" so relative-time labels (MessageTimestamp) render deterministically.
    MockDate.set('2024-04-01T12:00:00Z');
  },
};

export default preview;
