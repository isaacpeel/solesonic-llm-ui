import {useState, useEffect, useRef} from "react";
import {useNavigate} from "react-router-dom";

import "./UserSettings.css";
import RagManagement from "../train/RagManagement.jsx";
import ModelSettings from "./ModelSettings.jsx";
import OllamaModelSettings from "./OllamaModelSettings.jsx";
import { useLocation } from 'react-router-dom';

import {XMarkIcon, BackspaceIcon} from "@heroicons/react/24/solid";

import atlassianAuthService from "../service/AtlassianAuthService.js";
import AtlassianSettings from "./AtlassianSettings.jsx";
import GeneralUserSettings from "./GeneralUserSettings.jsx";
import {useKeycloak} from "../providers/KeycloakProvider.jsx";
import { SETTINGS_CONFIG } from './settingsConfig.js';
import RoleGuard from '../authorizer/RoleGuard.jsx';

const PANEL_COMPONENTS = {
    ragManagement: <RagManagement />,
    modelSettings: <ModelSettings />,
    ollamaModelSettings: <OllamaModelSettings />,
    atlassianSettings: <AtlassianSettings />,
    generalUserSettings: <GeneralUserSettings />,
};

const UserSettings = () => {
    const { hasRole } = useKeycloak();
    const visibleSettings = SETTINGS_CONFIG.filter(
        item => !item.requiredRole || hasRole(item.requiredRole)
    );
    const [selectedSetting, setSelectedSetting] = useState(
        visibleSettings[0]?.key ?? 'generalUserSettings'
    );
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
            callback(code).then(() => {
                useCallback.current = false;
            });
        }
    }, [location.search, useCallback]);

    const renderContent = () => {
        const panelConfig = SETTINGS_CONFIG.find(item => item.key === selectedSetting);

        if (!panelConfig) {
            return <p>Select a setting from the menu.</p>;
        }

        const panel = PANEL_COMPONENTS[selectedSetting] ?? <p>Select a setting from the menu.</p>;

        if (panelConfig.requiredRole) {
            return (
                <RoleGuard
                    role={panelConfig.requiredRole}
                    fallback={<p>You do not have permission to view this setting.</p>}
                >
                    {panel}
                </RoleGuard>
            );
        }

        return panel;
    };

    return (
        <div className="settings-container">
            <div className="settings-content-container">
                <div className="settings-sidebar">
                    <div className="settings-sidebar-header">
                        Settings
                    </div>
                    {visibleSettings.map(item => {
                        const Icon = item.icon;
                        return (
                            <div
                                key={item.key}
                                className={`settings-sidebar-item ${selectedSetting === item.key ? 'selected' : ''}`}
                                onClick={() => setSelectedSetting(item.key)}
                            >
                                <div className="settings-sidebar-icon">
                                    <Icon {...(item.iconProps ?? {})} />
                                </div>
                                <div className="settings-sidebar-item-label">{item.label}</div>
                            </div>
                        );
                    })}
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
