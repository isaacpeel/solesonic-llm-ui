import apiClient from '../client/ApiClient.js';
import config from '../properties/ApplicationProperties';
import {DEFAULT_CHAT_HISTORY_PAGE_SIZE, normalizeChatHistoryPage} from './ChatService.js';

/*
 * Conversation groups. Every call is scoped to the caller by the bearer token — there is no userId
 * in any of these paths — so a group or a chat that belongs to someone else is indistinguishable
 * from one that does not exist, and both come back as a 404.
 *
 * The API ships create/list/get/add/remove/reorder only: there is no rename and no delete for a
 * group, which is why neither appears anywhere in the UI.
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
};

export default chatGroupService;
