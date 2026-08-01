import './Header.css';
import {useNavigate} from "react-router-dom";
import {useSharedData} from "../context/useSharedData.jsx";
import UserDialog from "../user/UserDialog.jsx";
import {ArrowRightEndOnRectangleIcon} from "@heroicons/react/24/solid/index.js";
import {PencilSquareIcon} from "@heroicons/react/24/solid/index.js";
import ChatHistory from "../chat/ChatHistory.jsx";
import {SharedDataContext} from "../context/SharedDataContext.jsx";

const Header = () => {
    const {setChatHistory} = useSharedData();
    const {setChatId} = useSharedData();
    const {drawerOpen, setDrawerOpen} = useSharedData();
    const sharedRef = useSharedData(SharedDataContext);
    const navigate = useNavigate();

    const handleNewChat = () => {
        setChatHistory([]);
        setChatId(null);

        /*
         * Reachable from any route, so it has to land on the chat itself — and the input
         * only exists once ChatScreen has mounted there.
         */
        navigate("/");
        sharedRef.chatInputRef.current?.focus();
    };

    const toggleDrawer = () => setDrawerOpen(!drawerOpen);

    return (
        <div className="header-content">
            <div className="header-left">
                <div>
                    <div
                        className="icon-wrapper"
                        onClick={toggleDrawer}
                        data-dialog="Chat History"
                        data-edge-left=""
                    >
                        <ArrowRightEndOnRectangleIcon className="icon-button"/>
                    </div>
                    <div className={`drawer ${drawerOpen ? 'open' : ''}`}>
                        <ChatHistory drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen}/>
                    </div>
                </div>
                <div
                    className={`icon-wrapper ${drawerOpen ? 'drawer-open' : ''}`}
                    onClick={handleNewChat}
                    data-dialog="New Chat"
                >
                    <PencilSquareIcon/>
                </div>
            </div>
            <div>
                <UserDialog/>
            </div>
        </div>
    );
};

export default Header;
