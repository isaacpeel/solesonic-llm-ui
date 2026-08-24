import {describe, it, expect, vi, afterEach} from 'vitest';

vi.mock('../../src/client/ApiClient.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
        getUserId: vi.fn().mockResolvedValue('mock-user-id'),
    },
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {
        apiBaseUri: 'https://api.example.com',
        chatsUri: 'https://api.example.com/chats',
        chatGroupsUri: 'https://api.example.com/chatgroups',
        streamingChatsUri: 'https://api.example.com/streaming/chats',
    },
}));

import chatGroupService from '../../src/service/ChatGroupService.js';
import apiClient from '../../src/client/ApiClient.js';

const CHAT_GROUPS_URI = 'https://api.example.com/chatgroups';

afterEach(() => {
    vi.clearAllMocks();
});

describe('createGroup', () => {
    it('posts the name to the groups collection', async () => {
        apiClient.post.mockResolvedValue({id: 'group-1', name: 'Work'});

        const createdGroup = await chatGroupService.createGroup('Work');

        expect(apiClient.post).toHaveBeenCalledWith(CHAT_GROUPS_URI, {name: 'Work'});
        expect(createdGroup).toEqual({id: 'group-1', name: 'Work'});
    });
});

describe('findGroups', () => {
    it('gets the groups collection and returns the plain array unchanged', async () => {
        apiClient.get.mockResolvedValue([{id: 'group-1', name: 'Work'}, {id: 'group-2', name: 'Personal'}]);

        const groups = await chatGroupService.findGroups();

        expect(apiClient.get).toHaveBeenCalledWith(CHAT_GROUPS_URI);
        expect(groups.map(group => group.id)).toEqual(['group-1', 'group-2']);
    });
});

describe('findGroupChats', () => {
    it('builds the page query and flattens the response', async () => {
        apiClient.get.mockResolvedValue({
            content: [{id: 'chat-1'}],
            page: {size: 20, number: 0, totalElements: 3, totalPages: 2},
        });

        const page = await chatGroupService.findGroupChats('group-1');

        expect(apiClient.get).toHaveBeenCalledWith(`${CHAT_GROUPS_URI}/group-1/chats?page=0&size=20`);
        expect(page).toEqual({
            chats: [{id: 'chat-1'}],
            page: 0,
            last: false,
            totalPages: 2,
            totalElements: 3,
        });
    });

    it('passes an explicit page and size through', async () => {
        apiClient.get.mockResolvedValue({content: [{id: 'chat-9'}], page: {number: 2, totalPages: 3}});

        const page = await chatGroupService.findGroupChats('group-1', {page: 2, size: 5});

        expect(apiClient.get).toHaveBeenCalledWith(`${CHAT_GROUPS_URI}/group-1/chats?page=2&size=5`);
        expect(page.page).toBe(2);
    });
});

describe('addChatToGroup', () => {
    /* The endpoint takes no body at all; sending one would be a different request shape. */
    it('puts the chat under the group with no request body', async () => {
        apiClient.put.mockResolvedValue(null);

        await chatGroupService.addChatToGroup('group-1', 'chat-1');

        expect(apiClient.put).toHaveBeenCalledWith(`${CHAT_GROUPS_URI}/group-1/chats/chat-1`);
        expect(apiClient.put.mock.calls[0]).toHaveLength(1);
    });
});

describe('removeChatFromGroup', () => {
    it('deletes the chat out of the group', async () => {
        apiClient.delete.mockResolvedValue(null);

        const result = await chatGroupService.removeChatFromGroup('group-1', 'chat-1');

        expect(apiClient.delete).toHaveBeenCalledWith(`${CHAT_GROUPS_URI}/group-1/chats/chat-1`);
        expect(result).toBeNull();
    });
});

describe('deleteGroup', () => {
    it('deletes the group by id and returns null for the 204', async () => {
        apiClient.delete.mockResolvedValue(null);

        const result = await chatGroupService.deleteGroup('group-1');

        expect(apiClient.delete).toHaveBeenCalledWith(`${CHAT_GROUPS_URI}/group-1`);
        expect(result).toBeNull();
    });

    /*
     * The foreign key is `on delete set null`, so this call never takes conversations with it —
     * which is why deleting them as well is a cascade the caller performs.
     */
    it('sends no cascade flag of any kind', async () => {
        apiClient.delete.mockResolvedValue(null);

        await chatGroupService.deleteGroup('group-1');

        const [requestedUri, requestBody] = apiClient.delete.mock.calls[0];

        expect(requestedUri).not.toMatch(/\?/);
        expect(requestBody).toBeUndefined();
    });

    it('propagates the failure rather than swallowing it', async () => {
        apiClient.delete.mockRejectedValue(Object.assign(new Error('404'), {status: 404}));

        await expect(chatGroupService.deleteGroup('group-1')).rejects.toMatchObject({status: 404});
    });
});

describe('reorderChatInGroup', () => {
    it('puts the position to the group-scoped order endpoint', async () => {
        apiClient.put.mockResolvedValue({id: 'chat-1', groupSortOrder: 0});

        const movedChat = await chatGroupService.reorderChatInGroup('group-1', 'chat-1', 0);

        expect(apiClient.put).toHaveBeenCalledWith(`${CHAT_GROUPS_URI}/group-1/chats/chat-1/order`, {position: 0});
        expect(movedChat.groupSortOrder).toBe(0);
    });

    /* null is the unplace sentinel; it has to survive as a literal null, not be dropped. */
    it('sends a literal null position when the conversation is being unplaced', async () => {
        apiClient.put.mockResolvedValue({id: 'chat-1', groupSortOrder: null});

        await chatGroupService.reorderChatInGroup('group-1', 'chat-1', null);

        expect(apiClient.put).toHaveBeenCalledWith(`${CHAT_GROUPS_URI}/group-1/chats/chat-1/order`, {position: null});
        expect(JSON.stringify(apiClient.put.mock.calls[0][1])).toBe('{"position":null}');
    });
});
