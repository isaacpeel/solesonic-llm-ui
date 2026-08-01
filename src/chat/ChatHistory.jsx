import {useEffect, useRef} from "react";
import {useNavigate} from "react-router-dom";

import "./ChatHistory.css";
import {ArrowLeftEndOnRectangleIcon} from "@heroicons/react/24/solid";
import {useSharedData} from "../context/useSharedData.jsx";
import {SharedDataContext} from "../context/SharedDataContext.jsx";
import usePagedChatHistory from "../hooks/usePagedChatHistory.js";
import {groupChatsByDay} from "../util/chatHistoryGrouping.js";

/* Starts the next fetch while the sentinel is still below the fold, so scrolling stays smooth. */
const SENTINEL_ROOT_MARGIN = "200px";

function ChatHistory({userId, drawerOpen, setDrawerOpen}) {
    const {reloadHistoryTrigger, setChatId} = useSharedData();
    const sharedRef = useSharedData(SharedDataContext);
    const navigate = useNavigate();

    const drawerRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const sentinelRef = useRef(null);
    const toggleDrawer = () => setDrawerOpen(!drawerOpen);

    const {chats, loading, error, hasMore, loadMore, retry} = usePagedChatHistory({
        active: drawerOpen,
        reloadTrigger: reloadHistoryTrigger,
        userId,
    });

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

    /*
     * Infinite scroll: a sentinel at the end of the list pulls the next page as it comes into view
     * inside the drawer's own scroll box. The observer is rebuilt as rows arrive so a page that is
     * too short to push the sentinel out of view immediately asks for the following one.
     */
    useEffect(() => {
        if (!drawerOpen || !hasMore) {
            return;
        }

        const sentinel = sentinelRef.current;

        if (!sentinel || typeof IntersectionObserver === "undefined") {
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            if (entries.some(entry => entry.isIntersecting)) {
                loadMore();
            }
        }, {root: scrollContainerRef.current, rootMargin: SENTINEL_ROOT_MARGIN});

        observer.observe(sentinel);

        return () => {
            observer.disconnect();
        };
    }, [drawerOpen, hasMore, loadMore, chats.length]);

    // Truncate long messages
    const truncateMessage = (message, length = 25) =>
        message.length > length ? message.slice(0, length) + '...' : message;

    const groupedChats = groupChatsByDay(chats);

    const handleChatClick = (chatId) => {
        setChatId(chatId);
        setDrawerOpen(false);

        /*
         * The drawer is in the header, so a chat can be picked from any route. Without the
         * navigate the id changes behind a page that cannot render it, and the input ref is
         * null whenever ChatScreen is not mounted.
         */
        navigate("/");
        sharedRef.chatInputRef.current?.focus();
    };

    return (
        <div ref={drawerRef} className="chat-drawer-container">
            <div
                className="drawer-open icon-wrapper"
                onClick={toggleDrawer}
                data-dialog="Close Chat History"
                data-edge-left=""
            >
                <ArrowLeftEndOnRectangleIcon onClick={toggleDrawer}/>
            </div>
            <div className="chat-drawer" ref={scrollContainerRef}>
                <h2>Chat History</h2>
                <div className="chat-history-groups">
                    {groupedChats.map((group) => (
                        <div key={group.key} className="date-group">
                            <div className="date-header">{group.label}</div>
                            <div className="chat-list">
                                {group.chats.map((chat) => {
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
                </div>

                <div ref={sentinelRef} className="chat-history-sentinel">
                    {loading && (
                        <div className="chat-history-status">Loading…</div>
                    )}

                    {!loading && error && (
                        <div className="chat-history-status chat-history-error">
                            <span>Could not load chat history.</span>
                            <button type="button" className="chat-history-retry" onClick={retry}>
                                Retry
                            </button>
                        </div>
                    )}

                    {!loading && !error && chats.length === 0 && (
                        <div className="chat-history-status">No chats yet.</div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ChatHistory;
