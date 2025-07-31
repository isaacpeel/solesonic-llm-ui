import { useState, useEffect } from 'react';
import userPreferencesService from '../service/UserPreferencesService.js';
import './GeneralUserSettings.css';
import PropTypes from 'prop-types';
import {ToastContainer, toast, Bounce} from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const GeneralUserSettings = () => {
    const [similarityThreshold, setSimilarityThreshold] = useState(0.7);
    const [statusMessage, setStatusMessage] = useState('');

    useEffect(() => {
        const getUserPreferences = async () => {
            return await userPreferencesService.get();
        };

        getUserPreferences().then(userPreferences => {
            if (userPreferences.similarityThreshold !== undefined) {
                setSimilarityThreshold(userPreferences.similarityThreshold);
            }
        });
    }, []);

    const handleSimilarityThresholdChange = (e) => {
        const value = parseFloat(e.target.value);
        setSimilarityThreshold(value);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatusMessage('');

        try {
            const userPreferences = await userPreferencesService.get();
            const updatedPreferences = {
                ...userPreferences,
                similarityThreshold: parseFloat(similarityThreshold.toFixed(2))
            };

            await userPreferencesService.update(updatedPreferences);
            toast(
                "Similarity threshold updated successfully!", {
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
            setStatusMessage(`Error updating similarity threshold: ${error}`);
        }
    };

    return (
        <div className="general-settings-container">
            <ToastContainer />
            <h2>General Settings</h2>
            <form onSubmit={handleSubmit}>
                <div className="general-settings-item">
                    <label htmlFor="similarityThreshold" className="general-settings-item-label">
                        Similarity Threshold:
                    </label>
                    <input
                        type="number"
                        id="similarityThreshold"
                        value={similarityThreshold}
                        onChange={handleSimilarityThresholdChange}
                        step="0.01"
                        min="0"
                        max="1"
                        className="general-settings-input"
                    />
                </div>
                <div className="general-settings-description">
                    The similarity threshold determines how closely a document must match a query to be included in results.
                    Higher values (closer to 1) require closer matches, while lower values allow more diverse results.
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
        similarityThreshold: PropTypes.number
    })
};

export default GeneralUserSettings;
