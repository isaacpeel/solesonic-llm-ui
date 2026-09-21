import { http, HttpResponse } from 'msw';

/* A valid 1x1 transparent PNG, used everywhere a story needs a real image response. */
const ONE_PIXEL_PNG_HEX =
    '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000a49444154789c6360000002000100ffff03000006000' +
    '557bfabd40000000049454e44ae426082';

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);

    for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }

    return bytes;
}

const ONE_PIXEL_PNG_BYTES = hexToBytes(ONE_PIXEL_PNG_HEX);

function pngResponse() {
    return new HttpResponse(ONE_PIXEL_PNG_BYTES, { headers: { 'Content-Type': 'image/png' } });
}

/*
 * config.chatsUri / imagesUri / attachmentsUri are unset outside a real deployment
 * (VITE_API_BASE_URI), so requests resolve against the Storybook origin itself; the leading
 * `*` matches that regardless of what precedes the path.
 */
export const mswHandlers = [
    // DeleteChatDialog / DeleteChatGroupDialog -> chatService.deleteChat
    http.delete('*/chats/:chatId', () => new HttpResponse(null, { status: 204 })),

    // GeneratedImage -> imageGenerationService.fetchGeneratedImageBlob
    http.get('*/images/:imageId', pngResponse),

    // MessageAttachments / AttachmentTray -> attachmentService.fetchAttachmentBlob
    http.get('*/attachments/:attachmentId', pngResponse),

    // CreateChatGroupDialog -> chatGroupService.createGroup
    http.post('*/chatgroups', async ({ request }) => {
        const { name } = await request.json();
        return HttpResponse.json({ id: 'group-new', name });
    }),

    // DeleteChatGroupDialog -> chatGroupService.findGroupChats (one page, always last)
    http.get('*/chatgroups/:chatGroupId/chats', () => HttpResponse.json({
        content: [
            { id: 'chat-1', name: 'Trip planning notes' },
            { id: 'chat-2', name: 'Recipe ideas' },
        ],
        last: true,
        number: 0,
        totalPages: 1,
        totalElements: 2,
    })),

    // DeleteChatGroupDialog -> chatGroupService.deleteGroup
    http.delete('*/chatgroups/:chatGroupId', () => new HttpResponse(null, { status: 204 })),

    // ChatHistory (usePagedChatHistory) -> chatService.findChatHistory. Only page 0 has content,
    // so the drawer's infinite scroll stops after the first page.
    http.get('*/chats/users/:userId', ({ request }) => {
        const requestedPage = Number(new URL(request.url).searchParams.get('page') ?? '0');

        if (requestedPage > 0) {
            return HttpResponse.json({ content: [], last: true, number: requestedPage, totalPages: 1, totalElements: 2 });
        }

        return HttpResponse.json({
            content: [
                { id: 'chat-1', name: 'Weekend trip planning', timestamp: '2024-04-01T09:00:00Z' },
                { id: 'chat-2', name: null, chatMessages: [{ message: 'What is the capital of France?' }], timestamp: '2024-03-31T09:00:00Z' },
            ],
            last: true,
            number: 0,
            totalPages: 1,
            totalElements: 2,
        });
    }),

    // ChatHistory (useChatGroupSections) -> chatGroupService.findGroups
    http.get('*/chatgroups', () => HttpResponse.json([
        { id: 'group-1', name: 'Travel', sortOrder: 0 },
    ])),

    // AtlassianSettings / ConnectionsSettings -> atlassianAuthService.authUri
    http.get('*/atlassian/auth/uri', () => HttpResponse.json({ uri: 'https://auth.atlassian.com/authorize' })),

    // GoogleSettings / ConnectionsSettings -> googleAuthService.authUri
    http.get('*/google/auth/uri', () => HttpResponse.json({ uri: 'https://accounts.google.com/o/oauth2/auth' })),

    // GoogleSettings / ConnectionsSettings -> googleAuthService.profile (only called when connected)
    http.get('*/google/auth/profile', () => HttpResponse.json({ emailAddress: 'storybook-user@example.com' })),

    // GoogleSettings / ConnectionsSettings -> googleAuthService.revoke
    http.post('*/google/auth/revoke', () => new HttpResponse(null, { status: 204 })),

    // AtlassianSettings / GoogleSettings / ConnectionsSettings -> userPreferencesService.get.
    // Default: nothing connected yet; stories that need a connected state override this per-story.
    http.get('*/users/:userId/preferences', () => HttpResponse.json({
        atlassianAuthentication: false,
        googleAuthentication: false,
    })),

    // RagManagement (USER scope) -> documentService.findIngestedDocuments
    http.get('*/users/:userId/documents', () => HttpResponse.json({
        content: [
            { id: 'doc-1', fileName: 'employee-handbook.pdf', documentStatus: 'COMPLETED' },
            { id: 'doc-2', fileName: 'onboarding-notes.txt', documentStatus: 'IN_PROGRESS' },
        ],
        page: { totalPages: 1, totalElements: 2, number: 0 },
    })),

    // RagManagement (GLOBAL scope) -> documentService.findIngestedDocuments
    http.get('*/documents/global', () => HttpResponse.json({
        content: [
            { id: 'doc-g1', fileName: 'company-policy.pdf', documentStatus: 'COMPLETED' },
        ],
        page: { totalPages: 1, totalElements: 1, number: 0 },
    })),

    // RagManagement -> documentService.processDocumentQueue (GLOBAL scope, rag-admin only)
    http.post('*/documents/processQueue', () => new HttpResponse(null, { status: 204 })),
];
