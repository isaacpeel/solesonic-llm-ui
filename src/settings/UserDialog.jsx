import {useEffect, useRef, useState} from 'react';
import {useNavigate} from "react-router";
import {UserCircleIcon, Cog6ToothIcon, ArrowLeftEndOnRectangleIcon, UserGroupIcon} from "@heroicons/react/24/solid";
import {useKeycloak} from '../providers/KeycloakProvider.jsx';
import authService from '../service/AuthService.js';
import useSharedSessionsWaiting from '../sharedsessions/useSharedSessionsWaiting.js';
import "./UserDialog.css";
import "../sharedsessions/SharedSessions.css";

const UserDialog = () => {
    const {logout} = useKeycloak();
    const [userName, setUserName] = useState(null);
    const [showUserDialog, setShowUserDialog] = useState(false);
    const userDialogRef = useRef(null);
    const navigate = useNavigate();
    const sharedSessionsWaiting = useSharedSessionsWaiting();

    useEffect(() => {
        function handleClickOutside(event) {
            if (userDialogRef.current && !userDialogRef.current.contains(event.target)) {
                setShowUserDialog(false);
            }
        }

        document.addEventListener("mouseup", handleClickOutside);
        return () => {
            document.removeEventListener("mouseup", handleClickOutside);
        };
    }, [setShowUserDialog, userDialogRef]);

    useEffect(() => {
        const fetchUserData = async () => {
           return await authService.getUsername();
        };

        fetchUserData().then(username => setUserName(username));
    }, []);

    return (
        <div ref={userDialogRef}>
            <div
                className="icon-wrapper shared-sessions-link"
                data-dialog="User Options"
                onClick={() => setShowUserDialog(!showUserDialog)}
                data-edge-right=""
            >
                <UserCircleIcon/>
                {sharedSessionsWaiting && <span className="shared-sessions-link-dot" aria-label="A shared session is waiting on you"/>}
            </div>

            {showUserDialog && (
                <div className="user-dialog-container">
                    <div className="dialog-header">
                        <strong>{userName}</strong>
                    </div>

                    <div className="dialog-section">
                        <div
                            className="dropdown-item"
                            onClick={() => {
                                navigate("/settings");
                                setShowUserDialog(false);
                            }}
                        >
                            <Cog6ToothIcon className="icon"/>
                            Settings
                        </div>
                        <div
                            className="dropdown-item shared-sessions-link"
                            onClick={() => {
                                navigate("/shared-sessions");
                                setShowUserDialog(false);
                            }}
                        >
                            <UserGroupIcon className="icon"/>
                            Shared sessions
                            {sharedSessionsWaiting && <span className="shared-sessions-menu-dot" aria-label="A shared session is waiting on you"/>}
                        </div>
                    </div>

                    <div className="dialog-section">
                        <div
                            onClick={() => logout()}
                            className="dropdown-item"
                        >
                            <ArrowLeftEndOnRectangleIcon className="icon"/>
                            Sign Out
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default UserDialog;
