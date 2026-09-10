import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, act} from '@testing-library/react';
import {useEffect} from 'react';

/*
 * The two chat routes are the subject, so ChatScreen stands in as a probe that counts its own
 * mounts. Everything else App.jsx pulls in is stubbed: this test is about the shape of the route
 * tree, and the real components drag in Keycloak, the api client and the whole settings surface.
 */
let chatPageMountCount = 0;

vi.mock('../src/chat/ChatScreen.jsx', () => ({
    default: () => {
        useEffect(() => {
            chatPageMountCount += 1;
        }, []);

        return <div data-testid="chat-page"/>;
    },
}));

vi.mock('../src/common/Header.jsx', () => ({default: () => <div data-testid="header"/>}));
vi.mock('../src/settings/UserSettings.jsx', () => ({default: () => <div/>}));
vi.mock('../src/settings/GeneralUserSettings.jsx', () => ({default: () => <div/>}));
vi.mock('../src/settings/connections/ConnectionsSettings.jsx', () => ({default: () => <div/>}));
vi.mock('../src/settings/rag/RagManagement.jsx', () => ({default: () => <div/>}));
vi.mock('../src/settings/images/GeneratedImageManagement.jsx', () => ({default: () => <div/>}));
vi.mock('../src/settings/connections/GoogleAuthCallback.jsx', () => ({default: () => <div/>}));
vi.mock('../src/settings/connections/AtlassianAuthCallback.jsx', () => ({default: () => <div/>}));
vi.mock('../src/context/SharedDataContext.jsx', () => ({
    SharedDataProvider: ({children}) => <>{children}</>,
    SharedDataContext: {},
}));
vi.mock('../src/authorizer/AuthenticationWrapper.jsx', () => ({
    default: ({children}) => <>{children}</>,
}));
vi.mock('../src/App.css', () => ({}));

import {createMemoryRouter, RouterProvider} from 'react-router';
import {routes} from '../src/App.jsx';

describe('App routes', () => {
    beforeEach(() => {
        chatPageMountCount = 0;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('renders the chat screen at both the index route and a chat url', () => {
        const indexRouter = createMemoryRouter(routes, {initialEntries: ['/']});
        const {getByTestId, unmount} = render(<RouterProvider router={indexRouter}/>);

        expect(getByTestId('chat-page')).not.toBeNull();

        unmount();

        const chatRouter = createMemoryRouter(routes, {initialEntries: ['/chat/chat-a']});
        const {getByTestId: getByTestIdOnChatUrl} = render(<RouterProvider router={chatRouter}/>);

        expect(getByTestIdOnChatUrl('chat-page')).not.toBeNull();
    });

    /*
     * The load-bearing one. A new chat rewrites the url from `/` to `/chat/{id}` milliseconds
     * into its first stream, so a remount here would throw away the AbortController, the
     * streaming placeholder and every token accumulated so far — the answer would die halfway
     * through, every time, while continuing an existing chat carried on working.
     */
    it('keeps the chat screen mounted across the index-to-chat url transition', async () => {
        const router = createMemoryRouter(routes, {initialEntries: ['/']});

        render(<RouterProvider router={router}/>);

        expect(chatPageMountCount).toBe(1);

        await act(async () => {
            await router.navigate('/chat/chat-a', {replace: true});
        });

        expect(router.state.location.pathname).toBe('/chat/chat-a');
        expect(chatPageMountCount).toBe(1);
    });

    it('keeps it mounted going back the other way too', async () => {
        const router = createMemoryRouter(routes, {initialEntries: ['/chat/chat-a']});

        render(<RouterProvider router={router}/>);

        expect(chatPageMountCount).toBe(1);

        await act(async () => {
            await router.navigate('/');
        });

        expect(chatPageMountCount).toBe(1);
    });

    /*
     * Guards the mechanism rather than the symptom: reconciliation only holds while the two are
     * the same element type at the same depth. A layout or error boundary added around one of
     * them would keep both tests above passing in isolation but reintroduce the remount.
     */
    it('declares both chat routes as siblings rendering one element type', () => {
        const layoutChildren = routes[0].children;
        const indexRoute = layoutChildren.find((route) => route.index);
        const chatUrlRoute = layoutChildren.find((route) => route.path === 'chat/:chatId');

        expect(indexRoute).toBeDefined();
        expect(chatUrlRoute).toBeDefined();
        expect(chatUrlRoute.element.type).toBe(indexRoute.element.type);
    });
});
