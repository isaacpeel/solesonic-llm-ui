import {useEffect, useRef, useState} from "react";

/* Matches the server column, which is the same 255 for a conversation name and a group name. */
const MAXIMUM_NAME_LENGTH = 255;

/**
 * The rename editor, in place of a row's label.
 *
 * It replaces the label rather than sitting beside or below it: the drawer is virtualized and every
 * row was measured as one line, so a second line here would invalidate the position of every row
 * under it. Both things this drawer renames — a conversation and a group section header — are one
 * such line, which is why there is one editor rather than two.
 *
 * The draft lives here and the committed value is handed up, so a keystroke re-renders one input
 * rather than the whole windowed list. `commit` is one-shot because Enter closes the editor and
 * the blur that follows would otherwise submit the same name a second time.
 *
 * @param {{
 *   className: string,
 *   label: string,
 *   initialValue: string,
 *   placeholder: string,
 *   onCommit: (name: string) => void,
 *   onCancel: () => void,
 * }} props
 */
function ChatNameInput({className, label, initialValue, placeholder, onCommit, onCancel}) {
    const [draftName, setDraftName] = useState(initialValue);
    const inputRef = useRef(null);
    const committedRef = useRef(false);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const commit = () => {
        if (committedRef.current) {
            return;
        }

        committedRef.current = true;
        onCommit(draftName);
    };

    const handleKeyDown = (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            commit();
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            /* The drawer is listening above this row; cancelling an edit is not a drawer gesture. */
            event.stopPropagation();
            committedRef.current = true;
            onCancel();
        }
    };

    return (
        <input
            ref={inputRef}
            type="text"
            className={className}
            aria-label={label}
            value={draftName}
            placeholder={placeholder}
            maxLength={MAXIMUM_NAME_LENGTH}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commit}
            /* The row behind it opens the chat or expands the group; clicking the field must not. */
            onClick={(event) => event.stopPropagation()}
        />
    );
}

export default ChatNameInput;
