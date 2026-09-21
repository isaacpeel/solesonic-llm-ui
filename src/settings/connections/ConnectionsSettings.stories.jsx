import { http, HttpResponse } from 'msw';
import { expect, waitFor } from 'storybook/test';
import ConnectionsSettings from './ConnectionsSettings.jsx';

/*
 * atlassianAuthService/googleAuthService/userPreferencesService are mocked globally in
 * msw-handlers.js as "nothing connected yet". `Connected` overrides the preferences endpoint
 * with a story-level beforeEach, which Storybook runs after the shared preview's — so it wins.
 */
const meta = {
    component: ConnectionsSettings,
    tags: ['ai-generated'],
};

export default meta;

export const Disconnected = {
    play: async ({ canvas }) => {
        await waitFor(() => expect(canvas.getAllByText('Not connected')).toHaveLength(2));
    },
};

export const Connected = {
    async beforeEach({ msw }) {
        msw.use(
            http.get('*/users/:userId/preferences', () => HttpResponse.json({
                atlassianAuthentication: true,
                googleAuthentication: true,
            })),
        );
    },
    play: async ({ canvas }) => {
        await waitFor(() => expect(canvas.getAllByText('Connected')).toHaveLength(2));
        await waitFor(() => expect(canvas.getByText('Connected as storybook-user@example.com')).toBeVisible());
    },
};
