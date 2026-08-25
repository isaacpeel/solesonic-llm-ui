import {ChevronRightIcon} from "@heroicons/react/24/solid";
import {MdDragIndicator} from "react-icons/md";

import "./ChatGroupSection.css";
import ChatNameInput from "./ChatNameInput.jsx";
import ChatRowMenu from "./ChatRowMenu.jsx";
import {
    CHAT_GROUP_EMPTY_ROW,
    CHAT_GROUP_HEADER_ROW,
    CHAT_GROUP_LOAD_MORE_ROW,
} from "../util/chatHistoryRows.js";

const GROUP_DRAG_HANDLE_HINT = "Drag to reorder, or use the arrow keys";

const GROUP_NAME_PLACEHOLDER = "Group name";

/* The row types a conversation group contributes to the drawer's one flat list. */
export function isChatGroupRow(row) {
    return row?.type === CHAT_GROUP_HEADER_ROW
        || row?.type === CHAT_GROUP_EMPTY_ROW
        || row?.type === CHAT_GROUP_LOAD_MORE_ROW;
}

/**
 * One row of a conversation group section.
 *
 * A group does not own a subtree: its rows are flattened into the same virtualizer index space as
 * the day buckets, so the drawer renders them one at a time and this stands in for whichever one it
 * reached. Nothing here may wrap onto a second line or change height on hover — the virtualizer
 * placed every row below against the height this one measured.
 *
 * @param {{
 *   row: object,
 *   onToggle: (chatGroupId: string) => void,
 *   onLoadMore: (chatGroupId: string) => void,
 *   onRenameGroup: (row: object) => void,
 *   onDeleteGroup: (request: {chatGroupId: string, label: string}) => void,
 *   renaming: boolean,
 *   renameSeed: {value: string, attempt: number},
 *   onRenameCommit: (row: object, name: string) => void,
 *   onRenameCancel: () => void,
 *   dragHandleProps: (chatGroupId: string) => object,
 *   onDragHandleKeyDown: (event: KeyboardEvent, chatGroupId: string) => void,
 * }} props
 */
function ChatGroupSection({
    row,
    onToggle,
    onLoadMore,
    onRenameGroup,
    onDeleteGroup,
    renaming,
    renameSeed,
    onRenameCommit,
    onRenameCancel,
    dragHandleProps,
    onDragHandleKeyDown,
}) {
    if (row.type === CHAT_GROUP_HEADER_ROW) {
        return (
            /*
             * The header is a button, so both the grip and the kebab are its siblings rather than
             * nested inside it — a button within a button is invalid, and the grip has to be a real
             * one to carry focus for the arrow-key path.
             */
            <div className="chat-group-header-row">
                <button
                    type="button"
                    className="chat-history-drag-handle"
                    aria-label={`Reorder ${row.fullLabel}`}
                    title={GROUP_DRAG_HANDLE_HINT}
                    /* The header beside it expands the group; grabbing this must not. */
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => onDragHandleKeyDown(event, row.chatGroupId)}
                    {...dragHandleProps(row.chatGroupId)}
                >
                    <MdDragIndicator aria-hidden="true"/>
                </button>

                {renaming ? (
                    /* Remounted per attempt, so a name the server refused is seeded back as typed. */
                    <ChatNameInput
                        key={`${row.chatGroupId}:${renameSeed.attempt}`}
                        className="chat-group-rename"
                        label={GROUP_NAME_PLACEHOLDER}
                        initialValue={renameSeed.value}
                        placeholder={GROUP_NAME_PLACEHOLDER}
                        onCommit={(name) => onRenameCommit(row, name)}
                        onCancel={onRenameCancel}
                    />
                ) : (
                    <>
                        <button
                            type="button"
                            className="chat-group-header"
                            title={row.fullLabel}
                            aria-expanded={row.expanded}
                            onClick={() => onToggle(row.chatGroupId)}
                        >
                            <ChevronRightIcon
                                aria-hidden="true"
                                className={row.expanded
                                    ? "chat-group-chevron chat-group-chevron-expanded"
                                    : "chat-group-chevron"}
                            />

                            <span className="chat-group-name">{row.label}</span>

                            {/* Absent until the group's first page has landed — the number is not
                              * known before then, and GET /chatgroups does not carry it. */}
                            {row.count !== null && (
                                <span className="chat-group-count">{row.count}</span>
                            )}
                        </button>

                        {/* Arranging is a gesture rather than an action here: the grip beside this
                          * menu is what moves a group, so the menu offers only what it cannot. */}
                        <ChatRowMenu
                            label={row.fullLabel}
                            actions={[
                                {
                                    key: "renameGroup",
                                    label: "Rename group",
                                    onSelect: () => onRenameGroup(row),
                                },
                                {
                                    key: "deleteGroup",
                                    label: "Delete group",
                                    destructive: true,
                                    separatorBefore: true,
                                    onSelect: () => onDeleteGroup({
                                        chatGroupId: row.chatGroupId,
                                        label: row.fullLabel,
                                    }),
                                },
                            ]}
                        />
                    </>
                )}
            </div>
        );
    }

    if (row.type === CHAT_GROUP_EMPTY_ROW) {
        return <div className="chat-group-empty">{row.label}</div>;
    }

    return (
        <button
            type="button"
            className="chat-group-load-more"
            disabled={row.loading}
            onClick={() => onLoadMore(row.chatGroupId)}
        >
            {row.label}
        </button>
    );
}

export default ChatGroupSection;
