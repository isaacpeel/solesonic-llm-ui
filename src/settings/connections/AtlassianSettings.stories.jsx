import { http, HttpResponse } from 'msw';
import { expect, waitFor } from 'storybook/test';
import AtlassianSettings from './AtlassianSettings.jsx';

/* atlassianAuthService/userPreferencesService are mocked globally as "not authenticated". */
const meta = {
    component: AtlassianSettings,
    tags: ['ai-generated'],
};

export default meta;

export const NotAuthenticated = {
    play: async ({ canvasElement }) => {
        await waitFor(() => {
            expect(canvasElement.querySelector('[data-dialog="Your account is not authenticated"]')).toBeVisible();
        });
    },
};

export const Authenticated = {
    async beforeEach({ msw }) {
        msw.use(
            http.get('*/users/:userId/preferences', () => HttpResponse.json({ atlassianAuthentication: true })),
        );
    },
    play: async ({ canvasElement, canvas }) => {
        await waitFor(() => {
            expect(canvasElement.querySelector('[data-dialog="Your account is authenticated"]')).toBeVisible();
        });
        await expect(canvas.getByText('Re-Authenticate:')).toBeVisible();
    },
};
