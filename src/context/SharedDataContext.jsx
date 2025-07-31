import {createContext, useState, useRef} from "react";
import PropTypes from 'prop-types';

const SharedDataContext = createContext();

export function SharedDataProvider({children}) {
    const [chatHistory, setChatHistory] = useState([]);
    const [chatId, setChatId] = useState(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [reloadHistoryTrigger, setReloadHistoryTrigger] = useState(0);

    return (
        <SharedDataContext.Provider value={{
            chatHistory, setChatHistory,
            chatId, setChatId,
            drawerOpen, setDrawerOpen,
            reloadHistoryTrigger, setReloadHistoryTrigger,
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
