import { expect } from 'storybook/test';
import GoogleAuthCallback from './GoogleAuthCallback.jsx';

/*
 * Reads the authorization code from `window.location.search` at module-load time (see the
 * component's own comment), which is always empty inside Storybook — so it always takes the
 * "no code" branch and calls navigate('/settings') immediately. Nothing here depends on args.
 */
const meta = {
    component: GoogleAuthCallback,
    tags: ['ai-generated'],
};

export default meta;

export const Default = {
    play: async ({ canvas }) => {
        await expect(canvas.getByText('Connecting your Google account…')).toBeVisible();
    },
};
