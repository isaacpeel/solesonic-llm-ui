import {useState, useEffect} from 'react';
import ollamaService from '../service/OllamaService.js';
import userPreferencesService from '../service/UserPreferencesService.js';
import './ModelSettings.css';
import ModelDropdown from "./ModelDropdown.jsx";
import modelProps from "./UserPropTypes.js";
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

        getModels().then(models => {
            // Ensure models is an array
            const modelsArray = Array.isArray(models) ? models : [];
            setModels(modelsArray);

            getPreferences().then((preferences) => {
                const modelDetails = Array.isArray(modelsArray) ? 
                    modelsArray.find((model) => model.name === preferences.model) : 
                    undefined;
                setSelectedModel(modelDetails);
            })
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

ModelSettings.propTypes = modelProps;

export default ModelSettings;
