import {useState, useEffect} from 'react';
import ollamaService from '../service/OllamaService.js';
import userPreferencesService from '../service/UserPreferencesService.js';
import './ModelSettings.css';
import ModelDropdown from "./ModelDropdown.jsx";
import ModelDetails from "./ModelDetails.jsx";

const ModelSettings = () => {
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState(null);

    useEffect(() => {
        const getModels = async () => {
            return await ollamaService.models();
        };

        const getPreferences = async () => {
            return await userPreferencesService.get();
        }

        getModels()
            .then((models) => {
                const modelsArray = Array.isArray(models) ? models : [];
                setModels(modelsArray);

                getPreferences()
                    .then((preferences) => {
                        const modelDetails = Array.isArray(modelsArray)
                            ? modelsArray.find((model) => model.name === preferences.model)
                            : undefined;
                        setSelectedModel(modelDetails);
                    })
                    .catch((error) => {
                        console.error('[ModelSettings] Failed to load preferences:', error);
                    });
            })
            .catch((error) => {
                console.error('[ModelSettings] Failed to load models:', error);
            });
    }, [setModels, setSelectedModel]);

    return (
        <div className="general-settings-container">
            {Array.isArray(models) && models.length > 0 && selectedModel && (
                <ModelDropdown
                    models={models}
                    selectedModel={selectedModel}
                    setSelectedModel={setSelectedModel}
                />
            )}

            {/* Display Selected Model Details */}
            {selectedModel && <ModelDetails selectedModel={selectedModel} />}
        </div>
    );
}

export default ModelSettings;
