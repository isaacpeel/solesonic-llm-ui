import {MagnifyingGlassIcon, XMarkIcon} from "@heroicons/react/24/solid";

import "./ChatHistorySearchInput.css";
import {MAXIMUM_SEARCH_QUERY_LENGTH} from "../../util/chatHistorySearch.js";

function ChatHistorySearchInput({value, onChange, onClear}) {
    const handleKeyDown = (event) => {
        if (event.key === "Escape" && value !== "") {
            event.preventDefault();
            event.stopPropagation();
            onClear();
        }
    };

    return (
        <div className="chat-history-search" role="search">
            <MagnifyingGlassIcon aria-hidden="true" className="chat-history-search-icon"/>

            <input
                type="text"
                className="chat-history-search-input"
                aria-label="Search chats"
                placeholder="Search chats"
                value={value}
                maxLength={MAXIMUM_SEARCH_QUERY_LENGTH}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={handleKeyDown}
            />

            {value !== "" && (
                <button
                    type="button"
                    className="chat-history-search-clear"
                    aria-label="Clear search"
                    onClick={onClear}
                >
                    <XMarkIcon aria-hidden="true"/>
                </button>
            )}
        </div>
    );
}

export default ChatHistorySearchInput;
