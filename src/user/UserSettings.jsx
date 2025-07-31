import {useState, useEffect, useRef} from "react";
import {useNavigate} from "react-router-dom";

import "./UserSettings.css";
import RagManagement from "../train/RagManagement.jsx";
import ModelSettings from "./ModelSettings.jsx";
import OllamaModelSettings from "./OllamaModelSettings.jsx";
import { useLocation } from 'react-router-dom';

import {XMarkIcon, Cog6ToothIcon, CubeTransparentIcon, BackspaceIcon, UserCircleIcon, ServerIcon} from "@heroicons/react/24/solid";
import { AtlassianIcon } from '@atlaskit/logo';

import atlassianAuthService from "../service/AtlassianAuthService.js";
import AtlassianSettings from "./AtlassianSettings.jsx";
import GeneralUserSettings from "./GeneralUserSettings.jsx";

const UserSettings = () => {
    const [selectedSetting, setSelectedSetting] = useState("modelSettings");
    const navigate = useNavigate();
    const location = useLocation();
    const useCallback = useRef(true);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search || "");
        const code = queryParams.get('code');

        const callback = async (callbackToken) => {
            return atlassianAuthService.authCallback(callbackToken);
        };

        if (code && useCallback) {

            callback(code).then( () => {
                    useCallback.current = false;
                }
            );
        }
    }, [location.search, useCallback]);

    const renderContent = () => {
        switch (selectedSetting) {
            case "ragManagement":
                return <RagManagement/>;
            case "modelSettings":
                return <ModelSettings/>;
            case "ollamaModelSettings":
                return <OllamaModelSettings/>;
            case "atlassianSettings":
                return <AtlassianSettings/>;
            case "generalUserSettings":
                return <GeneralUserSettings/>;
            default:
                return <p>Select a setting from the menu.</p>;
        }
    };

    return (
        <div className="settings-container">
            <div className="settings-content-container">
                <div className="settings-sidebar">
                    <div className="settings-sidebar-header">
                        Settings
                    </div>
                    <div
                        className={`settings-sidebar-item ${selectedSetting === "modelSettings" ? "selected" : ""}`}
                        onClick={() => setSelectedSetting("modelSettings")}>
                        <div className="settings-sidebar-icon">
                            <Cog6ToothIcon/>
                        </div>
                        <div className="settings-sidebar-item-label">Chat Model</div>
                    </div>
                    <div
                        className={`settings-sidebar-item ${selectedSetting === "ollamaModelSettings" ? "selected" : ""}`}
                        onClick={() => setSelectedSetting("ollamaModelSettings")}>
                        <div className="settings-sidebar-icon">
                            <ServerIcon/>
                        </div>
                        <div className="settings-sidebar-item-label">Ollama Models</div>
                    </div>
                    <div
                        className={`settings-sidebar-item ${selectedSetting === "generalUserSettings" ? "selected" : ""}`}
                        onClick={() => setSelectedSetting("generalUserSettings")}>
                        <div className="settings-sidebar-icon">
                            <UserCircleIcon/>
                        </div>
                        <div className="settings-sidebar-item-label">General</div>
                    </div>
                    <div
                        className={`settings-sidebar-item ${selectedSetting === "atlassianSettings" ? "selected" : ""}`}
                        onClick={() => setSelectedSetting("atlassianSettings")}>
                        <div className="settings-sidebar-icon">
                            <AtlassianIcon size="small" appearance="brand"/>
                        </div>
                        <div className="settings-sidebar-item-label">Atlassian</div>
                    </div>
                    <div
                        className={`settings-sidebar-item ${selectedSetting === "ragManagement" ? "selected" : ""}`}
                        onClick={() => setSelectedSetting("ragManagement")}
                    >
                        <div className="settings-sidebar-icon">
                            <CubeTransparentIcon/>
                        </div>
                        <div className="settings-sidebar-item-label">RAG</div>
                    </div>
                    <div
                        className="settings-sidebar-mobile settings-sidebar-item"
                        onClick={() => navigate("/")}
                    >
                        <div className="settings-sidebar-icon">
                            <BackspaceIcon/>
                        </div>
                        <div className="settings-sidebar-item-label">Done</div>
                    </div>
                </div>

                <div className="settings-content">
                    <div className="settings-close-container">
                        <div
                            onClick={() => navigate("/")}
                            className="icon-wrapper"
                            data-edge-right=""
                            data-dialog="Close Settings"
                            style={{cursor: "pointer", zIndex: "100"}}
                        >
                        <XMarkIcon/>
                        </div>
                    </div>

                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default UserSettings;
