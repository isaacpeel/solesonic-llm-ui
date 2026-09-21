import { expect, waitFor } from 'storybook/test';
import RagManagement from './RagManagement.jsx';
import { KeycloakContext } from '../../providers/KeycloakProvider.jsx';

/*
 * Reads its :level param via useParams(), so each story sets `parameters.router` to give the
 * shared preview's Routes a real match instead of the default catch-all. documentService is
 * mocked per-scope in msw-handlers.js.
 */
const meta = {
    component: RagManagement,
    tags: ['ai-generated'],
};

export default meta;

export const UserLevel = {
    parameters: {
        router: { initialEntries: ['/settings/rag/user'], path: '/settings/rag/:level' },
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('Your documents')).toBeVisible();
        await waitFor(() => expect(canvas.getByText('employee-handbook.pdf')).toBeVisible());

        /* The stub role set has no rag-admin, so the Global tab is hidden. */
        await expect(canvas.queryByRole('link', { name: /Global/ })).not.toBeInTheDocument();
    },
};

export const ChatLevelWithNoActiveChat = {
    parameters: {
        router: { initialEntries: ['/settings/rag/chat'], path: '/settings/rag/:level' },
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('No chat-level documents yet. Start a chat to attach some.')).toBeVisible();
        await expect(canvas.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument();
    },
};

export const GlobalLevelAsAdmin = {
    parameters: {
        router: { initialEntries: ['/settings/rag/global'], path: '/settings/rag/:level' },
    },
    decorators: [
        (Story) => (
            <KeycloakContext.Provider value={{ hasRole: () => true }}>
                <Story />
            </KeycloakContext.Provider>
        ),
    ],
    play: async ({ canvas, userEvent }) => {
        await waitFor(() => expect(canvas.getByText('company-policy.pdf')).toBeVisible());
        await expect(canvas.getByText('Admin')).toBeVisible();

        await userEvent.click(canvas.getByRole('button', { name: 'Process document queue' }));
        await waitFor(() => expect(canvas.getByText('Document queue processing started.')).toBeVisible());
    },
};
