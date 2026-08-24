/*
 * Keyboard behaviour shared by the drawer's popovers.
 *
 * Four of them had grown their own copy of the same twenty-odd lines: the delete-conversation
 * dialog, the delete-group dialog, the create-group dialog and the drop-action menu. They are all
 * small, all portalled to `document.body`, and all want exactly the same two things — Escape closes
 * this and nothing above it, Tab stays inside.
 */

/*
 * Everything that can hold focus in a panel this size. Disabled controls are left out because a
 * dialog disables its buttons while a request is in flight, and Tab must not park on one.
 */
const FOCUSABLE_SELECTOR = [
    "button:not([disabled])",
    "select:not([disabled])",
    "input:not([disabled])",
    "textarea:not([disabled])",
    "a[href]",
].join(", ");

/**
 * Moves focus to the next or previous control inside `containerElement`, wrapping at either end.
 *
 * A trap rather than a focus-scope library: these panels hold two or three controls, and wrapping
 * by hand is a great deal less than a dependency.
 *
 * @returns {boolean} whether focus was moved, so the caller knows if it owns the keystroke.
 */
export function moveFocusWithin(containerElement, {backwards = false} = {}) {
    const focusableElements = Array.from(containerElement?.querySelectorAll(FOCUSABLE_SELECTOR) ?? []);

    if (focusableElements.length === 0) {
        return false;
    }

    const currentIndex = focusableElements.indexOf(document.activeElement);
    const step = backwards ? -1 : 1;
    const nextIndex = (currentIndex + step + focusableElements.length) % focusableElements.length;

    focusableElements[nextIndex].focus();

    return true;
}

/**
 * The `onKeyDown` a portalled panel wants.
 *
 * Escape stops propagating on purpose: the drawer is listening above all of these, and dismissing
 * one of its panels is not a gesture aimed at the drawer itself.
 *
 * Anything that is not Escape or Tab is left alone, so a panel can add its own keys on top.
 *
 * @param {KeyboardEvent} event
 * @param {{containerElement: Element|null, onDismiss: () => void}} options
 */
export function handleDialogKeyDown(event, {containerElement, onDismiss}) {
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
        return;
    }

    if (event.key !== "Tab") {
        return;
    }

    if (moveFocusWithin(containerElement, {backwards: event.shiftKey})) {
        event.preventDefault();
    }
}
