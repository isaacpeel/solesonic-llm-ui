import { expect, waitFor } from 'storybook/test';
import UserDialog from './UserDialog.jsx';

/*
 * Takes no props — the shared preview's stub AuthService/KeycloakContext (see
 * .storybook/preview.jsx) supply the username and the logout handler it reads internally.
 */
const meta = {
    component: UserDialog,
    tags: ['ai-generated'],
};

export default meta;

export const Closed = {
    play: async ({ canvas }) => {
        await expect(canvas.queryByText('Settings')).not.toBeInTheDocument();
    },
};

export const Open = {
    play: async ({ canvasElement, canvas, userEvent }) => {
        const trigger = canvasElement.querySelector('[data-dialog="User Options"]');
        await userEvent.click(trigger);

        /* .user-dialog-container fades in over 0.2s; wait past that instead of catching frame 0. */
        await waitFor(() => expect(canvas.getByText('Settings')).toBeVisible());
        await expect(canvas.getByText('Sign Out')).toBeVisible();
    },
};
