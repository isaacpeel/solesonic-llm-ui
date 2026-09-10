import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook} from '@testing-library/react';

const navigateSpy = vi.fn();

let routeParams = {};

vi.mock('react-router', () => ({
    useNavigate: () => navigateSpy,
    useParams: () => routeParams,
}));

vi.mock('../../src/context/useSharedData.jsx', () => ({
    useSharedData: vi.fn(),
}));

import useChatUrlSync from '../../src/hooks/useChatUrlSync.js';
import {useSharedData} from '../../src/context/useSharedData.jsx';

describe('useChatUrlSync', () => {
    let sharedState;

    beforeEach(() => {
        routeParams = {};
        sharedState = {
            chatId: null,
            setChatId: vi.fn(),
            setChatHistory: vi.fn(),
        };
        useSharedData.mockReturnValue(sharedState);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    /*
     * Rerenders the hook the way React would: the mocked context is read fresh on every render,
     * so moving either side means mutating it here and rerendering.
     */
    function renderSync() {
        const rendered = renderHook(() => useChatUrlSync());

        return {
            ...rendered,
            moveTo({routeChatId, chatId}) {
                if (routeChatId !== undefined) {
                    routeParams = routeChatId === null ? {} : {chatId: routeChatId};
                }

                if (chatId !== undefined) {
                    sharedState.chatId = chatId;
                }

                rendered.rerender();
            },
        };
    }

    it('adopts the id from a bookmarked url on the first render', () => {
        routeParams = {chatId: 'chat-a'};

        renderSync();

        expect(sharedState.setChatId).toHaveBeenCalledWith('chat-a');
        expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('does nothing at the index route with no chat open', () => {
        renderSync();

        expect(sharedState.setChatId).not.toHaveBeenCalled();
        expect(sharedState.setChatHistory).not.toHaveBeenCalled();
        expect(navigateSpy).not.toHaveBeenCalled();
    });

    /*
     * The whole reason the state-to-url direction exists: a new chat has no id until its first
     * `init` frame lands, mid-stream, with the url still at the index route.
     */
    it('rewrites the url when a new chat learns its id, replacing rather than pushing', () => {
        const {moveTo} = renderSync();

        moveTo({chatId: 'chat-new'});

        expect(navigateSpy).toHaveBeenCalledWith('/chat/chat-new', {replace: true});
        expect(sharedState.setChatId).not.toHaveBeenCalled();
    });

    /*
     * Two one-directional effects cannot tell this apart from the case above — both leave the
     * url empty while state holds an id — and would bounce the user straight back to /chat/a.
     */
    it('clears the open chat on a back navigation to the index route', () => {
        routeParams = {chatId: 'chat-a'};
        sharedState.chatId = 'chat-a';

        const {moveTo} = renderSync();

        moveTo({routeChatId: null});

        expect(sharedState.setChatId).toHaveBeenCalledWith(null);
        expect(sharedState.setChatHistory).toHaveBeenCalledWith([]);
        expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('adopts the id again on a forward navigation', () => {
        routeParams = {chatId: 'chat-a'};
        sharedState.chatId = 'chat-a';

        const {moveTo} = renderSync();

        moveTo({routeChatId: null, chatId: null});
        sharedState.setChatId.mockClear();
        sharedState.setChatHistory.mockClear();

        moveTo({routeChatId: 'chat-a'});

        expect(sharedState.setChatId).toHaveBeenCalledWith('chat-a');
        expect(sharedState.setChatHistory).not.toHaveBeenCalled();
        expect(navigateSpy).not.toHaveBeenCalled();
    });

    /* The sidebar sets the id and navigates in one commit, so there is nothing left to settle. */
    it('stays quiet when both sides move together', () => {
        routeParams = {chatId: 'chat-a'};
        sharedState.chatId = 'chat-a';

        const {moveTo} = renderSync();

        sharedState.setChatId.mockClear();

        moveTo({routeChatId: 'chat-b', chatId: 'chat-b'});

        expect(sharedState.setChatId).not.toHaveBeenCalled();
        expect(navigateSpy).not.toHaveBeenCalled();
    });

    /*
     * Reachable by leaving the chat routes entirely and coming back to the index one, since the
     * shared id outlives ChatScreen. The url is what the user asked for, so it wins.
     */
    it('lets the url win over a stale id on the first render', () => {
        sharedState.chatId = 'chat-stale';

        renderSync();

        expect(sharedState.setChatId).toHaveBeenCalledWith(null);
        expect(sharedState.setChatHistory).toHaveBeenCalledWith([]);
        expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('settles instead of looping once the two agree', () => {
        const {moveTo} = renderSync();

        moveTo({chatId: 'chat-new'});
        moveTo({routeChatId: 'chat-new'});

        expect(navigateSpy).toHaveBeenCalledTimes(1);
        expect(sharedState.setChatId).not.toHaveBeenCalled();
    });

    describe('clearOpenChat', () => {
        it('drops the transcript and returns to the index route without a history entry', () => {
            routeParams = {chatId: 'chat-a'};
            sharedState.chatId = 'chat-a';

            const {result} = renderSync();

            result.current.clearOpenChat();

            expect(sharedState.setChatHistory).toHaveBeenCalledWith([]);
            expect(sharedState.setChatId).toHaveBeenCalledWith(null);
            expect(navigateSpy).toHaveBeenCalledWith('/', {replace: true});
        });
    });
});
