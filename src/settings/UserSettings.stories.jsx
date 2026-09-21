import { expect } from 'storybook/test';
import UserSettings from './UserSettings.jsx';

/*
 * The shared preview's MemoryRouter has no matching <Routes> tree, so <Outlet/> renders nothing
 * here — this story is about the nav shell (back link, grouped nav, active-link styling), not
 * the routed content within it.
 */
const meta = {
    component: UserSettings,
    tags: ['ai-generated'],
};

export default meta;

export const Default = {
    play: async ({ canvas }) => {
        await expect(canvas.getByRole('link', { name: /Back to Chat/ })).toBeVisible();
        await expect(canvas.getByRole('link', { name: 'General' })).toBeVisible();
        await expect(canvas.getByRole('link', { name: 'Connections' })).toBeVisible();
        await expect(canvas.getByRole('link', { name: 'RAG' })).toBeVisible();
    },
};
