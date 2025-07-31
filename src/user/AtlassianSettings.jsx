import atlassianAuthService from "../service/AtlassianAuthService.js";
import userPreferencesService from "../service/UserPreferencesService.js";
import './AtlassianSettings.css';
import {useEffect, useState} from "react";
import {ArrowsRightLeftIcon, CheckIcon, ExclamationTriangleIcon} from "@heroicons/react/24/solid";
import PropTypes from "prop-types";

const AtlassianSettings = () => {
    const [atlassianAuthLink, setAtlassianAuthLink] = useState(null);
    const [atlassianAuthentication, setAtlassianAuthentication] = useState(null);

    useEffect(() => {
        const getAtlassianAuthUri = async () => {
            return await atlassianAuthService.authUri();
        }

        const getUserPreferences = async () => {
            return await userPreferencesService.get();
        }

        getAtlassianAuthUri().then(authUri => {
            setAtlassianAuthLink(authUri);
        })

        getUserPreferences().then(userPreferences => {
            setAtlassianAuthentication(userPreferences.atlassianAuthentication);
        })

    }, [setAtlassianAuthLink])

    const handleAuthClick = () => {
        window.location.href = atlassianAuthLink.uri;
    }

    return (
        <div className="atlassian-settings-container">
            <div className="atlassian-auth-container">
                <div className="atlassian-settings-item">
                    <div className="atlassian-settings-item-label">
                        Authenticated:
                    </div>

                    {atlassianAuthentication ? (
                        <div
                            className="icon-wrapper atlassian-settings-icon-wrapper"
                            data-dialog="Your account is authenticated"
                            data-edge-left=""
                            style={{cursor: 'default'}}
                        >
                            <CheckIcon/>
                        </div>
                    ) : (
                        <div
                            className="icon-wrapper atlassian-settings-icon-wrapper"
                            data-dialog="Your account is not authenticated"
                            data-edge-left=""
                            style={{cursor: 'default'}}
                        >
                            <ExclamationTriangleIcon/>
                        </div>
                    )}
                </div>
                <div className="atlassian-settings-item">

                    {atlassianAuthentication ? (
                        <div className="atlassian-settings-item-label">
                            Re-Authenticate:
                        </div>
                    ) : (
                        <div className="atlassian-settings-item-label">
                            Authenticate:
                        </div>
                    )}

                    {
                        atlassianAuthLink ? (
                            <div
                                className="icon-wrapper atlassian-settings-icon-wrapper"
                                onClick={handleAuthClick}
                                data-dialog="Authenticate Account"
                                data-edge-left=""
                            >
                                <ArrowsRightLeftIcon className="icon-button"/>
                            </div>

                        ) : (
                            <span>Loading authentication link...</span>
                        )
                    }
                </div>
            </div>
        </div>
    )
}

AtlassianSettings.propTypes = {
    userPreferences: PropTypes.shape({
            atlassianAuthentication: PropTypes.bool.isRequired,
        }
    )
}

export default AtlassianSettings;
