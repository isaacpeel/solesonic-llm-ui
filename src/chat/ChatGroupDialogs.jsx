import CreateChatGroupDialog from "./CreateChatGroupDialog.jsx";
import DeleteChatGroupDialog from "./DeleteChatGroupDialog.jsx";

/**
 * The two dialogs a conversation group opens.
 *
 * Both portal to `document.body`, so where they are mounted changes nothing about where they land.
 * The requests that open them live in `useChatGroupSections` rather than here, because they are
 * raised from three places the drawer owns — the `+ New group` button, a drop onto it, and the
 * out-of-drawer action menu — as well as from a group's own kebab.
 *
 * @param {{
 *   createGroupRequest: {chatToFile: object|null}|null,
 *   deleteGroupRequest: {chatGroupId: string, label: string}|null,
 *   streamingChatId: string|null,
 *   onCancelCreate: () => void,
 *   onCreated: (chatGroup: {id: string, name: string}) => void,
 *   onCancelDelete: () => void,
 *   onConversationsDeleted: (deletedChatIds: Array<string>) => void,
 *   onDeleted: (chatGroupId: string, deletedChatIds: Array<string>) => void,
 * }} props
 */
function ChatGroupDialogs({
    createGroupRequest,
    deleteGroupRequest,
    streamingChatId,
    onCancelCreate,
    onCreated,
    onCancelDelete,
    onConversationsDeleted,
    onDeleted,
}) {
    return (
        <>
            {createGroupRequest && (
                <CreateChatGroupDialog
                    onCancel={onCancelCreate}
                    onCreated={onCreated}
                />
            )}

            {deleteGroupRequest && (
                <DeleteChatGroupDialog
                    chatGroupId={deleteGroupRequest.chatGroupId}
                    label={deleteGroupRequest.label}
                    streamingChatId={streamingChatId}
                    onCancel={onCancelDelete}
                    onConversationsDeleted={onConversationsDeleted}
                    onDeleted={onDeleted}
                />
            )}
        </>
    );
}

export default ChatGroupDialogs;
