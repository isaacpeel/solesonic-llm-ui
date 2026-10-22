import {useCallback} from 'react';
import {appendProgressNotificationText} from '../service/ProgressNotificationService.js';
import {AI, ERROR, SYSTEM, USER} from '../chat/message/ChatMessage.jsx';
import {generateMessageKey} from '../util/keys.js';

function useChatHistoryMutations({setChatHistory, setChatId, adoptedChatIdRef}) {
    const appendErrorMessage = useCallback((text) => {
        if (!text || typeof text !== 'string') {
            return;
        }

        setChatHistory((previousHistory) => [
            ...previousHistory,
            {
                type: ERROR,
                text,
                _key: generateMessageKey('error'),
                timestamp: new Date().toISOString(),
            },
        ]);
    }, [setChatHistory]);

    const appendToLastAIMessage = useCallback((textToAppend) => {
        setChatHistory((previousHistory) => {
            const lastIndex = previousHistory.length - 1;

            if (lastIndex < 0) {
                return previousHistory;
            }

            const newHistory = [...previousHistory];
            const lastChatMessage = newHistory[lastIndex];

            if (lastChatMessage.type === AI) {
                const joinedMessage = `${lastChatMessage.text}${textToAppend}`;

                newHistory[lastIndex] = {
                    ...lastChatMessage,
                    text: joinedMessage,
                };
            }

            return newHistory;
        });
    }, [setChatHistory]);

    const finalizeLastAIMessage = useCallback((response) => {
        setChatHistory((previousHistory) => {
            const newHistory = [...previousHistory];
            const lastIndex = newHistory.length - 1;

            if (lastIndex >= 0 && newHistory[lastIndex].type === AI) {
                let finalText = response?.message?.message ?? newHistory[lastIndex].text;

                if (typeof finalText === 'string') {
                    finalText = finalText
                        .replace(/\r\n/g, '\n')
                        .replace(/\n{3,}/g, '\n\n');
                }

                /*
                 * The backend emits a progress frame for every image it describes, so a seed
                 * still standing at RUN_FINISHED means no image was read — drop it and flag the
                 * turn rather than show a completed step above an assistant asking for one.
                 */
                const seedWasNeverFulfilled = !!newHistory[lastIndex].hasSeededNotification;

                newHistory[lastIndex] = {
                    ...newHistory[lastIndex],
                    text: finalText,
                    responseMetadata: response?.message?.responseMetadata ?? null,
                    responseMetadataCalls: response?.message?.responseMetadataCalls ?? null,
                    timestamp: response?.message?.timestamp ?? newHistory[lastIndex].timestamp ?? new Date().toISOString(),
                    isStreaming: false,
                    notifications: seedWasNeverFulfilled ? [] : newHistory[lastIndex].notifications,
                    hasSeededNotification: false,
                    visionStepUnconfirmed: seedWasNeverFulfilled,
                };
            }

            return newHistory;
        });
    }, [setChatHistory]);

    const updateSeededNotificationText = useCallback((notificationMessageText) => {
        setChatHistory((previousHistory) => {
            const lastIndex = previousHistory.length - 1;

            if (lastIndex < 0) {
                return previousHistory;
            }

            const lastMessage = previousHistory[lastIndex];

            if (lastMessage.type !== AI || !lastMessage.hasSeededNotification) {
                return previousHistory;
            }

            const newHistory = [...previousHistory];
            newHistory[lastIndex] = {
                ...lastMessage,
                notifications: [notificationMessageText],
            };

            return newHistory;
        });
    }, [setChatHistory]);

    const attachGeneratedImagesToLastAIMessage = useCallback((generatedImages) => {
        if (!Array.isArray(generatedImages) || generatedImages.length === 0) {
            return;
        }

        setChatHistory((previousHistory) => {
            const lastIndex = previousHistory.length - 1;

            if (lastIndex < 0 || previousHistory[lastIndex].type !== AI) {
                return previousHistory;
            }

            const lastMessage = previousHistory[lastIndex];
            const existingImages = Array.isArray(lastMessage.generatedImages) ? lastMessage.generatedImages : [];
            const knownImageIds = new Set(existingImages.map((existingImage) => existingImage.imageId));
            const newImages = generatedImages.filter((generatedImage) => !knownImageIds.has(generatedImage.imageId));

            if (newImages.length === 0) {
                return previousHistory;
            }

            const newHistory = [...previousHistory];
            newHistory[lastIndex] = {
                ...lastMessage,
                generatedImages: [...existingImages, ...newImages],
            };

            return newHistory;
        });
    }, [setChatHistory]);

    const stopStreamingLastAIMessage = useCallback(() => {
        setChatHistory((previousHistory) => {
            const lastIndex = previousHistory.length - 1;

            if (lastIndex < 0 || previousHistory[lastIndex].type !== AI) {
                return previousHistory;
            }

            const newHistory = [...previousHistory];
            newHistory[lastIndex] = {
                ...newHistory[lastIndex],
                isStreaming: false,
                hasSeededNotification: false,
            };

            return newHistory;
        });
    }, [setChatHistory]);

    const appendSystemMessage = useCallback((text) => {
        if (!text || typeof text !== 'string') {
            return;
        }

        setChatHistory((previousHistory) => [
            ...previousHistory,
            {
                type: SYSTEM,
                text,
                _key: generateMessageKey('system'),
                timestamp: new Date().toISOString(),
            },
        ]);
    }, [setChatHistory]);

    const ensureChatIdFromResponse = useCallback((response) => {
        const resolvedChatId = response?.id ?? response?.chatId;

        if (resolvedChatId) {
            adoptedChatIdRef.current = resolvedChatId;

            setChatId((currentChatId) => {
                if (!currentChatId) {
                    return resolvedChatId;
                }

                return currentChatId;
            });
        }
    }, [setChatId, adoptedChatIdRef]);

    const adoptMessageIdForLastUserMessage = useCallback((messageId) => {
        if (!messageId) {
            return;
        }

        setChatHistory((previousHistory) => {
            for (let messageIndex = previousHistory.length - 1; messageIndex >= 0; messageIndex -= 1) {
                if (previousHistory[messageIndex].type === USER) {
                    const newHistory = [...previousHistory];
                    newHistory[messageIndex] = {...newHistory[messageIndex], messageId};

                    return newHistory;
                }
            }

            return previousHistory;
        });
    }, [setChatHistory]);

    const updateAttachmentStatus = useCallback((attachmentUpdate) => {
        const attachmentId = attachmentUpdate?.attachmentId;

        if (!attachmentId) {
            return;
        }

        setChatHistory((previousHistory) => {
            for (let messageIndex = previousHistory.length - 1; messageIndex >= 0; messageIndex -= 1) {
                const candidateMessage = previousHistory[messageIndex];

                if (candidateMessage.type !== USER || !Array.isArray(candidateMessage.attachments)) {
                    continue;
                }

                const attachmentIndex = candidateMessage.attachments.findIndex(
                    (attachment) => attachment.id === attachmentId,
                );

                if (attachmentIndex === -1) {
                    continue;
                }

                const newAttachments = [...candidateMessage.attachments];
                newAttachments[attachmentIndex] = {
                    ...newAttachments[attachmentIndex],
                    ...attachmentUpdate,
                };

                const newHistory = [...previousHistory];
                newHistory[messageIndex] = {...candidateMessage, attachments: newAttachments};

                return newHistory;
            }

            return previousHistory;
        });
    }, [setChatHistory]);

    const appendNotificationToLastAIMessage = useCallback((notificationMessageText) => {
        if (!notificationMessageText || typeof notificationMessageText !== 'string') {
            return;
        }

        const trimmedNotificationMessageText = notificationMessageText.trim();

        if (!trimmedNotificationMessageText) {
            return;
        }

        setChatHistory((previousHistory) => {
            const newHistory = [...previousHistory];
            const lastMessageIndex = newHistory.length - 1;

            if (lastMessageIndex < 0) {
                return previousHistory;
            }

            const lastMessage = newHistory[lastMessageIndex];

            if (lastMessage.type !== AI) {
                return previousHistory;
            }

            const existingNotifications = Array.isArray(lastMessage.notifications)
                ? lastMessage.notifications
                : [];

            if (lastMessage.hasSeededNotification) {
                newHistory[lastMessageIndex] = {
                    ...lastMessage,
                    notifications: [trimmedNotificationMessageText],
                    hasSeededNotification: false,
                };

                return newHistory;
            }

            newHistory[lastMessageIndex] = {
                ...lastMessage,
                notifications: appendProgressNotificationText(existingNotifications, trimmedNotificationMessageText),
            };

            return newHistory;
        });
    }, [setChatHistory]);

    return {
        appendErrorMessage,
        appendToLastAIMessage,
        finalizeLastAIMessage,
        updateSeededNotificationText,
        attachGeneratedImagesToLastAIMessage,
        stopStreamingLastAIMessage,
        appendSystemMessage,
        ensureChatIdFromResponse,
        adoptMessageIdForLastUserMessage,
        updateAttachmentStatus,
        appendNotificationToLastAIMessage,
    };
}

export default useChatHistoryMutations;
