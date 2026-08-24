import {createContext, useState, useRef} from "react";
import PropTypes from 'prop-types';

const SharedDataContext = createContext();

export function SharedDataProvider({children}) {
    const [chatHistory, setChatHistory] = useState([]);
    const [chatId, setChatId] = useState(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [reloadHistoryTrigger, setReloadHistoryTrigger] = useState(0);

    /*
     * The conversation with a turn in flight, or null. The chat drawer reads it to block deleting
     * that conversation: the backend does not cancel a stream on delete, so the turn would run to
     * completion and write a message onto a conversation that no longer exists.
     */
    const [streamingChatId, setStreamingChatId] = useState(null);

    return (
        <SharedDataContext.Provider value={{
            chatHistory, setChatHistory,
            chatId, setChatId,
            drawerOpen, setDrawerOpen,
            reloadHistoryTrigger, setReloadHistoryTrigger,
            streamingChatId, setStreamingChatId,
            chatInputRef: useRef(),
        }}>
            {children}
        </SharedDataContext.Provider>
    );
}

SharedDataProvider.propTypes = {
    children: PropTypes.node,
}

export { SharedDataContext };
