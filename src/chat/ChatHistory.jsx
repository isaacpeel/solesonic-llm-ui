import {useEffect, useRef, useState} from "react";
import PropTypes from "prop-types";

import "./ChatHistory.css";
import {ArrowLeftEndOnRectangleIcon} from "@heroicons/react/24/solid";
import {useSharedData} from "../context/useSharedData.jsx";
import chatService from "../service/ChatService.js";
import {SharedDataContext} from "../context/SharedDataContext.jsx";

function ChatHistory({userId, drawerOpen, setDrawerOpen}) {
    const {reloadHistoryTrigger, setChatId} = useSharedData();
    const sharedRef = useSharedData(SharedDataContext);

    const [userChatHistory, setUserChatHistory] = useState([]);
    const drawerRef = useRef(null)
    const toggleDrawer = () => setDrawerOpen(!drawerOpen);

    // Close drawer when clicking outside of it
    useEffect(() => {
        function handleClickOutside(event) {
            if (drawerRef.current && !drawerRef.current.contains(event.target)) {
                setDrawerOpen(false);
            }
        }

        document.addEventListener("mouseup", handleClickOutside);
        return () => {
            document.removeEventListener("mouseup", handleClickOutside);
        };
    }, [setDrawerOpen, sharedRef.chatInputRef]);

    useEffect(() => {
        async function getChatHistory() {
            return await chatService.findChatHistory(userId);
        }

        if (drawerOpen) {
            getChatHistory().then(data => setUserChatHistory(data));
        }
    }, [userId, reloadHistoryTrigger, drawerOpen]);

    // Truncate long messages
    const truncateMessage = (message, length = 25) =>
        message.length > length ? message.slice(0, length) + '...' : message;

    // Group chats by date
    const groupByDate = (chats) => {
        return chats.reduce((groups, chat) => {
            const date = new Date(chat.timestamp * 1000); // Convert from Unix timestamp
            const dateString = date.toLocaleDateString(); // Group by date string
            if (!groups[dateString]) groups[dateString] = [];
            groups[dateString].push(chat);
            return groups;
        }, {});
    };

    const groupedChats = groupByDate(userChatHistory);

    const handleChatClick = (chatId) => {
        setChatId(chatId);
        setDrawerOpen(false);
        sharedRef.chatInputRef.current.focus();
    };

    return (
        <div ref={drawerRef}>
            <div
                className="drawer-open icon-wrapper"
                onClick={toggleDrawer}
                data-dialog="Close Chat History"
                data-edge-left=""
            >
                <ArrowLeftEndOnRectangleIcon onClick={toggleDrawer}/>
            </div>
            <div className="chat-drawer">
                <h2>Chat History</h2>
                <ul>
                    {Object.keys(groupedChats).map((date) => (
                        <div key={date} className="date-group">
                            <div className="date-header">{date}</div>
                            <div className="chat-list">
                                {groupedChats[date].map((chat) => {
                                    const firstMessage = chat.chatMessages?.[0]?.message || 'No messages yet';
                                    return (
                                        <div
                                            key={chat.id}
                                            className="chat-item"
                                            onClick={() => handleChatClick(chat.id)}
                                        >
                                            {truncateMessage(firstMessage)}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </ul>
            </div>
        </div>
    );
}

ChatHistory.propTypes = {
    userId: PropTypes.string,
    drawerOpen: PropTypes.bool.isRequired,
    setDrawerOpen: PropTypes.func.isRequired,
    chat: PropTypes.shape({
        chatMessages: PropTypes.arrayOf(PropTypes.shape({
            message: PropTypes.string,
        })),
    })
};

export default ChatHistory;
