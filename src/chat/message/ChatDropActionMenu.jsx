import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";

/*
 * The panel chrome is the row menu's — same popover, same drawer, and a second description of it
 * would drift from the first. Only the parts this menu adds live in its own stylesheet.
 */
import "./ChatRowMenu.css";
import "./ChatDropActionMenu.css";
import {CHAT_HISTORY_PORTAL_ATTRIBUTE} from "./ChatRowMenu.jsx";
import {handleDialogKeyDown} from "../../util/dialogFocus.js";

const MENU_WIDTH = 236;

const VIEWPORT_GAP = 8;

/* Group ids are server-generated, so no real one can collide with this. */
const NEW_GROUP_VALUE = "new-group";

/* The select's resting value. Never a real choice, so picking any option is always a change. */
const NO_CHOICE_VALUE = "";

/**
 * What a conversation dragged clear of the drawer can become.
 *
 * None of these act directly — each opens something that already exists. That is the whole point
 * for Delete: `DeleteChatDialog` is what refuses to delete a conversation that is mid-turn, names
 * it, says that nothing is recoverable, and opens with focus on Cancel. Deleting from here would
 * route a destructive gesture around every one of those guards.
 *
 * Portalled and marked as part of the drawer, because `ChatHistory` closes the whole drawer on any
 * mouseup outside its own ref — without the marker it would close out from under this menu.
 *
 * @param {{
 *   label: string,
 *   point: {clientX: number, clientY: number},
 *   groups: Array<{id: string, name: string}>,
 *   currentChatGroupId: string|null,
 *   onNewGroup: () => void,
 *   onMoveToGroup: (chatGroupId: string) => void,
 *   onDelete: () => void,
 *   onDismiss: () => void,
 * }} props
 */
function ChatDropActionMenu({
    label,
    point,
    groups,
    currentChatGroupId,
    onNewGroup,
    onMoveToGroup,
    onDelete,
    onDismiss,
}) {
    const menuRef = useRef(null);
    const selectRef = useRef(null);

    /*
     * Sorted here rather than trusted from the response. The API orders groups by name at the
     * database's collation, which is not always what a reader calls alphabetical — `localeCompare`
     * is. The drawer's own group sections still render in the server's order; this is a picker, and
     * a picker that is hard to scan is the wrong place to be faithful to a SQL sort.
     */
    const sortedGroups = useMemo(() => (
        [...(groups ?? [])].sort((firstGroup, secondGroup) => (
            (firstGroup.name ?? "").localeCompare(secondGroup.name ?? "")
        ))
    ), [groups]);

    /*
     * Placed from where the conversation was released, then measured after mount rather than
     * guessed, so a release near the bottom of the viewport opens above the point instead of off
     * the edge of it.
     */
    const [menuPosition, setMenuPosition] = useState(() => ({
        top: point.clientY,
        left: Math.max(VIEWPORT_GAP, Math.min(point.clientX, window.innerWidth - MENU_WIDTH - VIEWPORT_GAP)),
    }));

    useLayoutEffect(() => {
        const menuHeight = menuRef.current?.offsetHeight ?? 0;
        const maximumTop = window.innerHeight - menuHeight - VIEWPORT_GAP;

        setMenuPosition(previousPosition => ({
            left: previousPosition.left,
            top: Math.max(VIEWPORT_GAP, Math.min(previousPosition.top, maximumTop)),
        }));

        selectRef.current?.focus();
    }, []);

    const dismiss = useCallback(() => {
        onDismiss();
    }, [onDismiss]);

    useEffect(() => {
        function handleOutsidePointerDown(event) {
            if (menuRef.current?.contains(event.target)) {
                return;
            }

            dismiss();
        }

        /*
         * `pointerdown` rather than the row menu's `mouseup`: this menu is opened *by* a pointer
         * release, and listening for the release would dismiss it on the very gesture that asked
         * for it.
         */
        document.addEventListener("pointerdown", handleOutsidePointerDown);
        document.addEventListener("scroll", dismiss, true);

        return () => {
            document.removeEventListener("pointerdown", handleOutsidePointerDown);
            document.removeEventListener("scroll", dismiss, true);
        };
    }, [dismiss]);

    const handleGroupChange = (event) => {
        const chosenValue = event.target.value;

        if (chosenValue === NEW_GROUP_VALUE) {
            onNewGroup();
            return;
        }

        onMoveToGroup(chosenValue);
    };

    /*
     * Escape and Tab come from the shared helper; Tab must wrap rather than dismiss the way a pure
     * menu would, or the Delete button would be unreachable from the select.
     */
    const handleKeyDown = (event) => handleDialogKeyDown(event, {
        containerElement: menuRef.current,
        onDismiss: dismiss,
    });

    return createPortal(
        <div
            ref={menuRef}
            className="chat-row-menu chat-drop-action-menu"
            role="group"
            aria-label={`Actions for ${label}`}
            style={{top: `${menuPosition.top}px`, left: `${menuPosition.left}px`, width: `${MENU_WIDTH}px`}}
            onKeyDown={handleKeyDown}
            {...{[CHAT_HISTORY_PORTAL_ATTRIBUTE]: "true"}}
        >
            <div className="chat-drop-action-field">
                <span className="chat-drop-action-field-label" id="chat-drop-action-group-label">
                    Move to
                </span>

                {/*
                  * Controlled at a value no option carries, so the select falls back to its prompt
                  * after every choice — picking the same destination twice still registers.
                  */}
                <select
                    ref={selectRef}
                    className="chat-drop-action-select"
                    value={NO_CHOICE_VALUE}
                    aria-labelledby="chat-drop-action-group-label"
                    onChange={handleGroupChange}
                >
                    <option value={NO_CHOICE_VALUE} disabled>Choose a group…</option>
                    <option value={NEW_GROUP_VALUE}>New Group</option>

                    {sortedGroups.map(chatGroup => (
                        <option
                            key={chatGroup.id}
                            value={chatGroup.id}
                            /* Already its home; choosing it would be a request for no change. */
                            disabled={chatGroup.id === currentChatGroupId}
                        >
                            {chatGroup.name}
                        </option>
                    ))}
                </select>
            </div>

            <button
                type="button"
                className="chat-row-menu-item chat-row-menu-item-destructive chat-row-menu-item-separated"
                onClick={onDelete}
            >
                <span className="chat-row-menu-item-label">Delete conversation</span>
            </button>
        </div>,
        document.body
    );
}

export default ChatDropActionMenu;
