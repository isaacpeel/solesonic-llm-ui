import {useCallback, useEffect, useRef} from 'react';
import {useSharedData} from '../context/useSharedData.jsx';
import chatService from '../service/ChatService.js';
import {normalizeGeneratedImage} from '../service/ImageGenerationService.js';
import {
    appendProgressNotificationText,
    formatProgressNotificationText
} from '../service/ProgressNotificationService.js';
import {AI, SYSTEM} from '../chat/message/ChatMessage.jsx';
import useChatHistoryMutations from './useChatHistoryMutations.js';

function useChatHistory({onChatIdChangedExternally, onChatNotFound, onHydrated} = {}) {
    const {chatId, setChatId, chatHistory, setChatHistory, adoptedChatIdRef} = useSharedData();

    /*
     * Held in a ref rather than listed as a dependency of the hydration effect below. That
     * effect clears `adoptedChatIdRef` on its fetching path, so re-running it refetches — and a
     * caller passing an inline arrow would give it a new identity on every render.
     */
    const onChatNotFoundRef = useRef(onChatNotFound);

    useEffect(() => {
        onChatNotFoundRef.current = onChatNotFound;
    }, [onChatNotFound]);

    const onHydratedRef = useRef(onHydrated);

    useEffect(() => {
        onHydratedRef.current = onHydrated;
    }, [onHydrated]);

    /*
     * Reused by conversation-scoped UI state (e.g. a pinned slash command) that must reset on a
     * real chat switch but survive a new chat's own RUN_STARTED frame assigning its id — the
     * same distinction `adoptedChatIdRef` already draws for hydration below.
     */
    const previousChatIdRef = useRef(chatId);

    useEffect(() => {
        const previousChatId = previousChatIdRef.current;
        previousChatIdRef.current = chatId;

        if (chatId === previousChatId || adoptedChatIdRef.current === chatId) {
            return;
        }

        onChatIdChangedExternally?.();
    }, [chatId, onChatIdChangedExternally]);

    useEffect(() => {
        if (chatHistory.length === 0) {
            const welcomeMessage = {
                type: AI,
                text: 'Hi! How can I assist you today?',
                ephemeral: true,
                _key: `welcome-${Date.now()}`,
            };

            setChatHistory([welcomeMessage]);
        }
    }, [chatHistory, setChatHistory]);

    /*
     * Callable form of the hydration below, so stream recovery can pull the server's view of a
     * turn without going through `chatId` — the id is already set by then, and the
     * `adoptedChatIdRef` guard would suppress the effect anyway. Rejects on failure; the effect
     * catches, recovery decides for itself.
     */
    const reloadChatHistory = useCallback(async (targetChatId = chatId) => {
        if (!targetChatId) {
            return;
        }

        return await reloadChatHistoryInto(targetChatId, setChatHistory);
    }, [chatId, setChatHistory]);

    const historyMutations = useChatHistoryMutations({setChatHistory, setChatId, adoptedChatIdRef});
    const {appendErrorMessage} = historyMutations;

    useEffect(() => {
        if (!chatId) {
            return;
        }

        /*
         * A new chat learns its id from its own RUN_STARTED frame, milliseconds after the stream
         * opens. Hydrating on that transition would read a server state holding only the USER
         * message — the streaming placeholder would be replaced, and every later frame would
         * land on a USER entry where appendToLastAIMessage/finalizeLastAIMessage drop it in
         * silence. Skip exactly that one transition; a real sidebar selection still hydrates.
         */
        if (adoptedChatIdRef.current === chatId) {
            return;
        }

        /*
         * Cleared only on the fetching path, so this stays correct if the user later navigates
         * away and back to the same chat, and so React StrictMode's double-invoked effect takes
         * the same branch both times.
         */
        adoptedChatIdRef.current = null;

        /*
         * The id this run asked for. A slow request that lands after the user has moved on must
         * not act on the conversation now open — evicting it would drag them out of a chat they
         * are reading and blame a different one.
         */
        const requestedChatId = chatId;
        let supersededByLaterChat = false;

        reloadChatHistory()
            .then((chatDetails) => {
                if (!supersededByLaterChat) {
                    onHydratedRef.current?.(requestedChatId, chatDetails);
                }
            })
            .catch((error) => {
                if (supersededByLaterChat) {
                    return;
                }

                /*
                 * Handled here rather than inside `reloadChatHistory`, which stream recovery
                 * awaits and relies on rejecting. 403 sits alongside 404 because the two are the
                 * same event to the user — the id names nothing they can open, whether it never
                 * existed or belongs to someone else — and only the backend knows which it is.
                 */
                if (error?.status === 404 || error?.status === 403) {
                    onChatNotFoundRef.current?.(requestedChatId);
                    return;
                }

                console.error('[useChatHistory] Failed to load chat details:', error);
                appendErrorMessage('This conversation could not be loaded. Please try again.');
            });

        return () => {
            supersededByLaterChat = true;
        };
    }, [chatId, reloadChatHistory, appendErrorMessage]);

    return {
        chatId,
        chatHistory,
        setChatHistory,
        setChatId,
        ...historyMutations,
        reloadChatHistory,
    };
}

export default useChatHistory;

export async function reloadChatHistoryInto(chatId, setChatHistory) {
    const chatDetails = await chatService.findChatDetails(chatId);
    const formattedMessages = formatChatMessages(chatId, chatDetails);

    setChatHistory((previousHistory) => {
        return mergeFetchedChatHistoryWithLocalNotifications(formattedMessages, previousHistory);
    });

    return chatDetails;
}

function formatChatMessages(chatId, response) {
    const formattedMessages = [];
    let pendingProgressNotifications = [];

    response.chatMessages.forEach((message, index) => {
        if (message.progressData) {
            /*
             * The persisted frame carries the same progress/total the live one did, so a
             * reloaded turn shows the same percentages the user watched count up.
             */
            const notificationText = formatProgressNotificationText({
                ...message.progressData,
                message: message.progressData.message || message.message,
            });

            if (notificationText) {
                pendingProgressNotifications = appendProgressNotificationText(pendingProgressNotifications, notificationText);
            }

            return;
        }

        const base = {
            type: message.messageType,
            text: message.message,
            /* Persisted alongside model/generatedImages, so a reloaded turn shows it too. */
            responseMetadata: message.responseMetadata ?? null,
            responseMetadataCalls: message.responseMetadataCalls ?? null,
            messageId: message.id,
            /* ISO-8601 with an offset, same shape as the chat-level one parseChatTimestamp reads. */
            timestamp: message.timestamp,
            attachments: Array.isArray(message.attachments) ? message.attachments : [],
            commands: Array.isArray(message.commands) ? message.commands : [],
            /*
             * Only the reference is ever persisted (plan §5), so a reloaded turn
             * re-renders the stored image rather than regenerating it.
             */
            generatedImages: Array.isArray(message.generatedImages)
                ? message.generatedImages.map((generatedImage) => normalizeGeneratedImage(generatedImage))
                : [],
            _key: message.id ?? `${chatId || 'new'}-${index}`,
        };

        if (message.messageType === SYSTEM && message.elicitationId && message.elicitationResponse) {
            base.elicitationId = message.elicitationId;

            /*
             * `summary` is the resolved, human-readable answer (e.g. "isaac" for an assignee
             * picker) — preferred whenever the backend supplies it. `action` alone survives for
             * records persisted before the backend started returning `summary`.
             */
            base.elicitationResponse = message.elicitationResponse.summary || message.elicitationResponse.action;
        }

        if (message.messageType === AI && pendingProgressNotifications.length > 0) {
            base.notifications = pendingProgressNotifications;
            pendingProgressNotifications = [];
        }

        formattedMessages.push(base);
    });

    return formattedMessages;
}

function mergeFetchedChatHistoryWithLocalNotifications(fetchedHistory, previousHistory) {
    if (!Array.isArray(fetchedHistory)) {
        return previousHistory;
    }

    const lastLocalMessage = previousHistory[previousHistory.length - 1];
    const localNotifications = Array.isArray(lastLocalMessage?.notifications) ? lastLocalMessage.notifications : [];

    /*
     * A bubble that is still streaming outranks anything the server can report about it: its
     * turn is not persisted yet, so hydrating over it would discard the tokens already on
     * screen and unseat the AI entry the remaining frames append to.
     */
    const isLastLocalMessageStreaming = lastLocalMessage?.type === AI && !!lastLocalMessage.isStreaming;
    const shouldPreserveLastLocalMessage = lastLocalMessage?.type === AI
        && (isLastLocalMessageStreaming || localNotifications.length > 0);

    if (!shouldPreserveLastLocalMessage) {
        return fetchedHistory;
    }

    if (fetchedHistory.length === 0) {
        return previousHistory;
    }

    /*
     * Keep the live bubble itself — text, notifications and `_key` all intact, so no remount
     * and no lost tokens. Any trailing fetched AI row is the server's partial view of this
     * same turn, so it is dropped rather than rendered as a second bubble.
     */
    if (isLastLocalMessageStreaming) {
        const historyBeforeStreamingMessage = fetchedHistory[fetchedHistory.length - 1]?.type === AI
            ? fetchedHistory.slice(0, -1)
            : fetchedHistory;

        return [...historyBeforeStreamingMessage, lastLocalMessage];
    }

    const mergedHistory = [...fetchedHistory];
    const lastFetchedMessageIndex = mergedHistory.length - 1;
    const lastFetchedMessage = mergedHistory[lastFetchedMessageIndex];

    if (lastFetchedMessage?.type !== AI) {
        return [...mergedHistory, {
            ...lastLocalMessage,
            notifications: localNotifications,
        }];
    }

    mergedHistory[lastFetchedMessageIndex] = {
        ...lastFetchedMessage,
        notifications: localNotifications,
    };

    return mergedHistory;
}
