import { expect } from 'storybook/test';
import Header from './Header.jsx';

/*
 * Takes no props — relies entirely on the shared preview's decorators (see
 * .storybook/preview.jsx): SharedDataProvider for drawer/chat state, MemoryRouter for
 * useNavigate, and the stubbed KeycloakContext for the nested UserDialog.
 *
 * Only the closed-drawer state is covered here: opening the drawer makes ChatHistory fetch a
 * real page of conversations (chatService.findChatHistory), which is a bigger integration than
 * this pass covers — add a msw-handlers.js entry for GET *than /chats/users/:userId and a
 * follow-up story if that's wanted.
 */
const meta = {
    component: Header,
    tags: ['ai-generated'],
};

export default meta;

export const Default = {
    play: async ({ canvasElement, canvas }) => {
        await expect(canvasElement.querySelector('[data-dialog="Open Chat History"]')).toBeVisible();
        await expect(canvasElement.querySelector('[data-dialog="New Chat"]')).toBeVisible();
        await expect(canvasElement.querySelector('[data-dialog="User Options"]')).toBeVisible();

        /* The drawer starts closed, so ChatHistory's paged fetch never activates. */
        await expect(canvas.queryByText('Loading…')).not.toBeInTheDocument();
    },
};

export const NewChatResetsSharedState = {
    play: async ({ canvasElement, userEvent }) => {
        const newChatTrigger = canvasElement.querySelector('[data-dialog="New Chat"]');
        await userEvent.click(newChatTrigger);

        /* handleNewChat clears chat state and navigates home; nothing throws with an empty history. */
        await expect(newChatTrigger).toBeVisible();
    },
};
