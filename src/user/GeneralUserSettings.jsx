import { useState, useEffect } from 'react';
import userPreferencesService from '../service/UserPreferencesService.js';
import './GeneralUserSettings.css';
import PropTypes from 'prop-types';
import {ToastContainer, toast, Bounce} from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const GeneralUserSettings = () => {
    const [chatSimilarityThreshold, setChatSimilarityThreshold] = useState(0.7);
    const [userSimilarityThreshold, setUserSimilarityThreshold] = useState(0.7);
    const [globalSimilarityThreshold, setGlobalSimilarityThreshold] = useState(0.7);
    const [statusMessage, setStatusMessage] = useState('');

    useEffect(() => {
        const getUserPreferences = async () => {
            return await userPreferencesService.get();
        };

        getUserPreferences()
            .then((userPreferences) => {
                if (userPreferences.chatSimilarityThreshold !== undefined) {
                    setChatSimilarityThreshold(userPreferences.chatSimilarityThreshold);
                }

                if (userPreferences.userSimilarityThreshold !== undefined) {
                    setUserSimilarityThreshold(userPreferences.userSimilarityThreshold);
                }

                if (userPreferences.globalSimilarityThreshold !== undefined) {
                    setGlobalSimilarityThreshold(userPreferences.globalSimilarityThreshold);
                }
            })
            .catch((error) => {
                console.error('[GeneralUserSettings] Failed to load preferences:', error);
            });
    }, []);

    const handleChatSimilarityThresholdChange = (e) => {
        const value = parseFloat(e.target.value);
        setChatSimilarityThreshold(value);
    };

    const handleUserSimilarityThresholdChange = (e) => {
        const value = parseFloat(e.target.value);
        setUserSimilarityThreshold(value);
    };

    const handleGlobalSimilarityThresholdChange = (e) => {
        const value = parseFloat(e.target.value);
        setGlobalSimilarityThreshold(value);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatusMessage('');

        try {
            const userPreferences = await userPreferencesService.get();
            const updatedPreferences = {
                ...userPreferences,
                chatSimilarityThreshold: parseFloat(chatSimilarityThreshold.toFixed(2)),
                userSimilarityThreshold: parseFloat(userSimilarityThreshold.toFixed(2)),
                globalSimilarityThreshold: parseFloat(globalSimilarityThreshold.toFixed(2))
            };

            await userPreferencesService.update(updatedPreferences);
            toast(
                "Similarity thresholds updated successfully!", {
                    position: "top-right",
                    autoClose: 2500,
                    hideProgressBar: true,
                    closeOnClick: true,
                    pauseOnHover: false,
                    draggable: false,
                    progress: undefined,
                    theme: "dark",
                    transition: Bounce,
                });
        } catch (error) {
            setStatusMessage(`Error updating similarity thresholds: ${error}`);
        }
    };

    return (
        <div className="general-settings-container">
            <ToastContainer />
            <h2>General Settings</h2>
            <form onSubmit={handleSubmit}>
                <div className="general-settings-item">
                    <label htmlFor="chatSimilarityThreshold" className="general-settings-item-label">
                        Chat Similarity Threshold:
                    </label>
                    <input
                        type="number"
                        id="chatSimilarityThreshold"
                        value={chatSimilarityThreshold}
                        onChange={handleChatSimilarityThresholdChange}
                        step="0.01"
                        min="0"
                        max="1"
                        className="general-settings-input"
                    />
                </div>
                <div className="general-settings-item">
                    <label htmlFor="userSimilarityThreshold" className="general-settings-item-label">
                        User Similarity Threshold:
                    </label>
                    <input
                        type="number"
                        id="userSimilarityThreshold"
                        value={userSimilarityThreshold}
                        onChange={handleUserSimilarityThresholdChange}
                        step="0.01"
                        min="0"
                        max="1"
                        className="general-settings-input"
                    />
                </div>
                <div className="general-settings-item">
                    <label htmlFor="globalSimilarityThreshold" className="general-settings-item-label">
                        Global Similarity Threshold:
                    </label>
                    <input
                        type="number"
                        id="globalSimilarityThreshold"
                        value={globalSimilarityThreshold}
                        onChange={handleGlobalSimilarityThresholdChange}
                        step="0.01"
                        min="0"
                        max="1"
                        className="general-settings-input"
                    />
                </div>
                <div className="general-settings-description">
                    Similarity thresholds determine how closely a document must match a query to be included in results,
                    scoped to the current chat, all of your documents, or the global document set. Higher values (closer to 1)
                    require closer matches, while lower values allow more diverse results.
                </div>
                <button type="submit" className="general-settings-submit-button">
                    Save Settings
                </button>
            </form>
            {statusMessage && (
                <div className="general-settings-status-message">
                    {statusMessage}
                </div>
            )}
        </div>
    );
};

GeneralUserSettings.propTypes = {
    userPreferences: PropTypes.shape({
        chatSimilarityThreshold: PropTypes.number,
        userSimilarityThreshold: PropTypes.number,
        globalSimilarityThreshold: PropTypes.number
    })
};

export default GeneralUserSettings;
