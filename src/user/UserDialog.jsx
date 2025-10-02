import {useEffect, useRef, useState} from 'react';
import {useNavigate} from "react-router-dom";
import {UserCircleIcon, Cog6ToothIcon, ArrowLeftEndOnRectangleIcon} from "@heroicons/react/24/solid";
import {useKeycloak} from '../providers/KeycloakProvider.jsx';
import authService from '../service/AuthService.js';
import "./UserDialog.css";

const UserDialog = () => {
    const {logout} = useKeycloak();
    const [userName, setUserName] = useState(null);
    const [showUserDialog, setShowUserDialog] = useState(false);
    const userDialogRef = useRef(null);
    const navigate = useNavigate();

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
                className="icon-wrapper"
                data-dialog="User Options"
                onClick={() => setShowUserDialog(!showUserDialog)}
                data-edge-right=""
            >
                <UserCircleIcon/>
            </div>

            {showUserDialog && (
                <div className="user-dialog-container">
                    <div className="dialog-header">
                        <strong>{userName}</strong>
                    </div>

                    <div className="dialog-section">
                        <div
                            className="dropdown-item"
                            onClick={() => navigate("/settings")}
                        >
                            <Cog6ToothIcon className="icon"/>
                            Settings
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
