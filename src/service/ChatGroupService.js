import apiClient from '../client/ApiClient.js';
import config from '../properties/ApplicationProperties';
import {DEFAULT_CHAT_HISTORY_PAGE_SIZE, normalizeChatHistoryPage} from './ChatService.js';

/*
 * Conversation groups. Every call is scoped to the caller by the bearer token — there is no userId
 * in any of these paths — so a group or a chat that belongs to someone else is indistinguishable
 * from one that does not exist, and both come back as a 404.
 *
 * The API ships create, list, update, delete, add, remove, and a conversation's place inside a
 * group. A group's own place in the list is not an endpoint of its own: it is the `sortOrder` on
 * the group, written by the same update call that writes the name.
 */
const chatGroupService = {
    createGroup: async (name) => {
        return await apiClient.post(config.chatGroupsUri, {name});
    },

    /* A plain array, not a page — groups are not paginated. */
    findGroups: async () => {
        return await apiClient.get(config.chatGroupsUri);
    },

    /*
     * One page of a group's conversations. Same page shape as the main chat list, so it reuses
     * ChatService's normalizer rather than growing a second one that could drift from it.
     */
    findGroupChats: async (chatGroupId, {page = 0, size = DEFAULT_CHAT_HISTORY_PAGE_SIZE} = {}) => {
        const queryString = new URLSearchParams({page: String(page), size: String(size)}).toString();
        const response = await apiClient.get(`${config.chatGroupsUri}/${chatGroupId}/chats?${queryString}`);

        return normalizeChatHistoryPage(response, page);
    },

    /* Idempotent, and body-less: filing a chat already in this group leaves its position alone. */
    addChatToGroup: async (chatGroupId, chatId) => {
        return await apiClient.put(`${config.chatGroupsUri}/${chatGroupId}/chats/${chatId}`);
    },

    /* Ungroups only — the conversation and its messages are untouched. Not in this group is a 404. */
    removeChatFromGroup: async (chatGroupId, chatId) => {
        return await apiClient.delete(`${config.chatGroupsUri}/${chatGroupId}/chats/${chatId}`);
    },

    /*
     * Deletes the group itself. Its conversations are **ungrouped, not deleted** — the foreign key
     * is `on delete set null`, so they survive and fall back into the date-ordered list.
     *
     * Deleting the conversations as well is therefore not something this call can do; it is a
     * client-side cascade over `chatService.deleteChat`, which `DeleteChatGroupDialog` owns.
     */
    deleteGroup: async (chatGroupId) => {
        return await apiClient.delete(`${config.chatGroupsUri}/${chatGroupId}`);
    },

    /*
     * Moves a conversation within one group, reading and writing groupSortOrder. The chat's place in
     * the user's whole list is a different column and a different endpoint; the two must never be
     * mixed, or a move here silently reshuffles the list the user was not looking at.
     */
    reorderChatInGroup: async (chatGroupId, chatId, position) => {
        return await apiClient.put(`${config.chatGroupsUri}/${chatGroupId}/chats/${chatId}/order`, {position});
    },

    /*
     * The whole group, and the only way to write one.
     *
     * `PUT /chatgroups/{chatGroupId}` is a full update rather than a patch: both writable fields are
     * taken exactly as sent. A body carrying only a new name silently unplaces the group, and one
     * carrying only a rank is refused with a 400 because the missing name reads as blank. Taking the
     * group itself rather than loose arguments is what makes both mistakes unrepresentable — a
     * caller spreads the group it already holds and overrides the one field it means to change.
     *
     * `sortOrder` is a rank, not an index. The server stores the number as sent and renumbers no
     * other row, so gaps and duplicates are legal and permanent, and rearranging several groups is
     * one call per group whose rank actually changed.
     */
    updateChatGroup: async (chatGroup) => {
        return await apiClient.put(`${config.chatGroupsUri}/${chatGroup.id}`, {
            name: chatGroup.name,
            sortOrder: chatGroup.sortOrder ?? null,
        });
    },
};

export default chatGroupService;
