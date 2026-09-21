import { expect } from 'storybook/test';
import GeneralUserSettings from './GeneralUserSettings.jsx';
import { KeycloakContext } from '../providers/KeycloakProvider.jsx';

/*
 * Reads `user` straight from useKeycloak() with no props of its own — each story overrides the
 * shared preview's stub KeycloakContext with a decorator to show a different profile shape.
 */
const meta = {
    component: GeneralUserSettings,
    tags: ['ai-generated'],
};

export default meta;

function withKeycloakUser(user) {
    return (Story) => (
        <KeycloakContext.Provider value={{ user, hasRole: () => false }}>
            <Story />
        </KeycloakContext.Provider>
    );
}

export const FullProfile = {
    decorators: [withKeycloakUser({
        given_name: 'Ada',
        family_name: 'Lovelace',
        preferred_username: 'ada',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        roles: ['user', 'admin'],
    })],
    play: async ({ canvas }) => {
        await expect(canvas.getByText('AL')).toBeVisible();
        await expect(canvas.getByText('ada@example.com')).toBeVisible();
        await expect(canvas.getByText('admin')).toBeVisible();
    },
};

export const MinimalProfile = {
    decorators: [withKeycloakUser({
        preferred_username: 'guest42',
        roles: [],
    })],
    play: async ({ canvas }) => {
        await expect(canvas.getByText('G')).toBeVisible();
        await expect(canvas.getByText('No roles assigned')).toBeVisible();
    },
};
