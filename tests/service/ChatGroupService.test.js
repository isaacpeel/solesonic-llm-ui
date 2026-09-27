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

describe('updateChatGroup', () => {
    const PLACED_GROUP = {id: 'group-1', userId: 'user-1', name: 'Work', sortOrder: 3, timestamp: '2026-08-01T10:00:00Z'};

    /*
     * The group itself, not a sub-resource. The `/name` suffix this replaced is gone from the API,
     * so a request that still carried it would answer 404 — which is exactly what this guards.
     */
    it('puts the group to the group resource, with no suffix on the path', async () => {
        apiClient.put.mockResolvedValue({...PLACED_GROUP});

        const updatedGroup = await chatGroupService.updateChatGroup(PLACED_GROUP);

        expect(apiClient.put.mock.calls[0][0]).toBe(`${CHAT_GROUPS_URI}/group-1`);
        expect(updatedGroup.sortOrder).toBe(3);
    });

    /*
     * A full update, not a patch: a rename that omitted the rank would be read as `sortOrder: null`
     * and would silently drop the group out of the arrangement it was in.
     */
    it('carries the existing rank through a rename', async () => {
        apiClient.put.mockResolvedValue({...PLACED_GROUP, name: 'Client work'});

        await chatGroupService.updateChatGroup({...PLACED_GROUP, name: 'Client work'});

        expect(apiClient.put).toHaveBeenCalledWith(
            `${CHAT_GROUPS_URI}/group-1`,
            {name: 'Client work', sortOrder: 3},
        );
    });

    /* The mirror image: a body with only a rank in it reads as a blank name and answers 400. */
    it('carries the existing name through a reorder', async () => {
        apiClient.put.mockResolvedValue({...PLACED_GROUP, sortOrder: 1});

        await chatGroupService.updateChatGroup({...PLACED_GROUP, sortOrder: 1});

        expect(apiClient.put).toHaveBeenCalledWith(
            `${CHAT_GROUPS_URI}/group-1`,
            {name: 'Work', sortOrder: 1},
        );
    });

    /* A falsy check here reads rank zero as "unplaced" — the same silent loss as omitting it. */
    it('sends a rank of zero as a literal zero', async () => {
        apiClient.put.mockResolvedValue({...PLACED_GROUP, sortOrder: 0});

        await chatGroupService.updateChatGroup({...PLACED_GROUP, sortOrder: 0});

        expect(apiClient.put.mock.calls[0][1].sortOrder).toBe(0);
        expect(JSON.stringify(apiClient.put.mock.calls[0][1])).toBe('{"name":"Work","sortOrder":0}');
    });

    /* A group that has never been arranged is unplaced, and stating that is a literal null. */
    it('sends a literal null for a group that carries no rank', async () => {
        apiClient.put.mockResolvedValue({id: 'group-2', name: 'Personal', sortOrder: null});

        await chatGroupService.updateChatGroup({id: 'group-2', name: 'Personal'});

        expect(JSON.stringify(apiClient.put.mock.calls[0][1])).toBe('{"name":"Personal","sortOrder":null}');
    });

    /* Read-only on the wire: Jackson drops them, so sending them would only be noise. */
    it('sends the two writable fields and nothing else', async () => {
        apiClient.put.mockResolvedValue({...PLACED_GROUP});

        await chatGroupService.updateChatGroup(PLACED_GROUP);

        expect(Object.keys(apiClient.put.mock.calls[0][1])).toEqual(['name', 'sortOrder']);
    });

    /* A stale sidebar, which the caller answers by refetching the list rather than by retrying. */
    it('propagates a 404 for the caller to handle', async () => {
        apiClient.put.mockRejectedValue(Object.assign(new Error('404'), {status: 404}));

        await expect(chatGroupService.updateChatGroup(PLACED_GROUP)).rejects.toMatchObject({status: 404});
    });
});
