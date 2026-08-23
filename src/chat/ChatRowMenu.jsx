import {useCallback, useEffect, useLayoutEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {EllipsisVerticalIcon} from "@heroicons/react/24/solid";

import "./ChatRowMenu.css";

/*
 * Marks the portalled menu as part of the drawer even though it is not inside `drawerRef`.
 * `ChatHistory` closes the whole drawer on any `mouseup` outside that ref, which would otherwise
 * tear the menu down before the click on one of its items ever landed.
 */
export const CHAT_HISTORY_PORTAL_ATTRIBUTE = "data-chat-history-portal";

const MENU_WIDTH = 180;

/* Keeps the menu clear of the trigger, and off the edge of the viewport. */
const MENU_OFFSET = 4;

const VIEWPORT_GAP = 8;

/**
 * The per-row action menu for the chat history drawer.
 *
 * Rows are virtualized: they are absolutely positioned inside an `overflow-y: auto` scroll box, so
 * a menu rendered as a child of the row would be clipped by that box and would scroll away from
 * its own trigger. It is therefore portalled to `document.body` and placed with `position: fixed`
 * from the trigger's rectangle — which is only valid until something moves, hence the close on
 * scroll and on resize rather than a re-measure.
 *
 * Actions are data rather than markup, so the ordering and deleting stories can add to the menu
 * without touching it.
 *
 * @param {{
 *   actions: Array<{
 *     key: string,
 *     label: string,
 *     onSelect: () => void,
 *     destructive?: boolean,
 *     disabled?: boolean,
 *     disabledReason?: string,
 *   }>,
 *   label: string,
 * }} props
 */
function ChatRowMenu({actions, label}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({top: 0, left: 0});

    const triggerRef = useRef(null);
    const menuRef = useRef(null);

    const closeMenu = useCallback(({returnFocus = false} = {}) => {
        setMenuOpen(false);

        if (returnFocus) {
            triggerRef.current?.focus();
        }
    }, []);

    const handleTriggerClick = (event) => {
        /* `.chat-item`'s own onClick is what opens the chat; this button must never do that. */
        event.stopPropagation();

        if (menuOpen) {
            closeMenu();
            return;
        }

        const triggerRectangle = triggerRef.current?.getBoundingClientRect();

        if (triggerRectangle) {
            const maximumLeft = window.innerWidth - MENU_WIDTH - VIEWPORT_GAP;
            const preferredLeft = triggerRectangle.right - MENU_WIDTH;

            setMenuPosition({
                top: triggerRectangle.bottom + MENU_OFFSET,
                left: Math.max(VIEWPORT_GAP, Math.min(preferredLeft, maximumLeft)),
            });
        }

        setMenuOpen(true);
    };

    /* Focus lands on the first item, so the menu is operable by keyboard the moment it opens. */
    useLayoutEffect(() => {
        if (!menuOpen) {
            return;
        }

        menuRef.current?.querySelector(".chat-row-menu-item:not([disabled])")?.focus();
    }, [menuOpen]);

    /*
     * The placement is a snapshot of where the trigger was, so anything that moves it invalidates
     * the menu. Closing is the honest response — re-measuring against a row that may have been
     * unmounted by the virtualizer mid-scroll is not.
     */
    useEffect(() => {
        if (!menuOpen) {
            return;
        }

        function handleViewportChange() {
            closeMenu();
        }

        function handleOutsideMouseUp(event) {
            const insideMenu = menuRef.current?.contains(event.target);
            const insideTrigger = triggerRef.current?.contains(event.target);

            /*
             * A mouseup on an item is left alone: unmounting the button here would cancel the
             * `click` the browser is about to dispatch to it, and the action would never run.
             */
            if (insideMenu || insideTrigger) {
                return;
            }

            closeMenu();
        }

        /* Capturing, because the drawer's scroll box scrolls rather than the document. */
        document.addEventListener("scroll", handleViewportChange, true);
        window.addEventListener("resize", handleViewportChange);
        document.addEventListener("mouseup", handleOutsideMouseUp);

        return () => {
            document.removeEventListener("scroll", handleViewportChange, true);
            window.removeEventListener("resize", handleViewportChange);
            document.removeEventListener("mouseup", handleOutsideMouseUp);
        };
    }, [menuOpen, closeMenu]);

    const handleMenuKeyDown = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeMenu({returnFocus: true});
            return;
        }

        /* Tabbing out of a menu closes it rather than walking the rest of the page behind it. */
        if (event.key === "Tab") {
            closeMenu();
            return;
        }

        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
            return;
        }

        event.preventDefault();

        const items = Array.from(menuRef.current?.querySelectorAll(".chat-row-menu-item:not([disabled])") ?? []);

        if (items.length === 0) {
            return;
        }

        const currentIndex = items.indexOf(document.activeElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = (currentIndex + step + items.length) % items.length;

        items[nextIndex].focus();
    };

    const handleItemClick = (event, action) => {
        event.stopPropagation();
        closeMenu();
        action.onSelect();
    };

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className={menuOpen ? "chat-row-menu-trigger chat-row-menu-trigger-open" : "chat-row-menu-trigger"}
                aria-label={`Actions for ${label}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={handleTriggerClick}
            >
                <EllipsisVerticalIcon aria-hidden="true"/>
            </button>

            {menuOpen && createPortal(
                <div
                    ref={menuRef}
                    className="chat-row-menu"
                    role="menu"
                    aria-label={`Actions for ${label}`}
                    style={{top: `${menuPosition.top}px`, left: `${menuPosition.left}px`, width: `${MENU_WIDTH}px`}}
                    onKeyDown={handleMenuKeyDown}
                    {...{[CHAT_HISTORY_PORTAL_ATTRIBUTE]: "true"}}
                >
                    {actions.map((action) => (
                        <button
                            key={action.key}
                            type="button"
                            role="menuitem"
                            className={action.destructive ? "chat-row-menu-item chat-row-menu-item-destructive" : "chat-row-menu-item"}
                            disabled={action.disabled}
                            title={action.disabled ? action.disabledReason : undefined}
                            onClick={(event) => handleItemClick(event, action)}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
}

export default ChatRowMenu;
