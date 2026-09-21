import { http, HttpResponse } from 'msw';
import { expect, waitFor } from 'storybook/test';
import GoogleSettings from './GoogleSettings.jsx';

/* googleAuthService/userPreferencesService are mocked globally as "not connected". */
const meta = {
    component: GoogleSettings,
    tags: ['ai-generated'],
};

export default meta;

export const NotConnected = {
    play: async ({ canvasElement }) => {
        await waitFor(() => {
            expect(canvasElement.querySelector('[data-dialog="Your Google account is not connected"]')).toBeVisible();
        });
    },
};

export const Connected = {
    async beforeEach({ msw }) {
        msw.use(
            http.get('*/users/:userId/preferences', () => HttpResponse.json({ googleAuthentication: true })),
        );
    },
    play: async ({ canvas, canvasElement, userEvent }) => {
        await waitFor(() => {
            expect(canvas.getByText('Connected as storybook-user@example.com')).toBeVisible();
        });

        await userEvent.click(canvasElement.querySelector('[data-dialog="Disconnect Google Account"]'));
        await expect(canvas.getByText(/Disconnecting revokes access at Google/)).toBeVisible();
    },
};
