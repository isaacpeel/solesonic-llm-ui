import {useState, useEffect} from 'react';
import ollamaService from '../service/OllamaService.js';
import './OllamaModelSettings.css';
import {BoltIcon, BoltSlashIcon, CheckIcon} from "@heroicons/react/16/solid";
import {ToastContainer, toast, Bounce} from 'react-toastify';

const OllamaModelSettings = () => {
    const [models, setModels] = useState([]);
    const [installedModels, setInstalledModels] = useState([]);
    const [availableInstalledModels, setAvailableInstalledModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        censored: false,
    });

    useEffect(() => {
        fetchModels();
        fetchInstalledModels();
    }, []);

    useEffect(() => {
        // Filter out installed models that are already configured
        if (installedModels.length > 0 && Array.isArray(models) && models.length > 0) {
            const configuredModelNames = models.map(model => model.ollamaModel.model);
            const available = installedModels.filter(model => !configuredModelNames.includes(model.ollamaModel.model));

            setAvailableInstalledModels(available);
        }
    }, [installedModels, models]);

    const fetchModels = async () => {
        try {
            const modelsList = await ollamaService.models();
            // Ensure modelsList is an array
            const modelsArray = Array.isArray(modelsList) ? modelsList : [];
            setModels(modelsArray);
            if (modelsArray.length > 0 && !selectedModel) {
                setSelectedModel(modelsArray[0]);
            }
        } catch (error) {
            alert('Error fetching models: ' + error.message);
            setModels([]);
        }
    };

    const fetchInstalledModels = async () => {
        try {
            const installed = await ollamaService.installedModels();
            // Ensure installed is an array
            const installedArray = Array.isArray(installed) ? installed : [];
            setInstalledModels(installedArray);
        } catch (error) {
            alert('Error fetching installed models: ' + error.message);
            setInstalledModels([]);
        }
    };

    const handleSelectModel = (model) => {
        setSelectedModel(model);
        setIsEditing(false);
        setIsCreating(false);
    };

    const handleInputChange = (e) => {
        const {name: fieldName, value, type, checked} = e.target;

        // If we're creating a model and a model is selected from the dropdown,
        // don't allow changing the name field manually
        if (isCreating && selectedInstalledModel && fieldName === 'name') {
            return;
        }

        // Create updated form data
        const updatedData = {
            ...formData,
            [fieldName]: type === 'checkbox' ? checked : value
        };

        // Always update the model field to match the name field when the name changes
        // This ensures consistency between name and model fields
        if (fieldName === 'name') {
            updatedData.model = value;
        }
        setFormData(updatedData);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (isCreating) {
                // Ensure model field is set to the same value as name if it's empty
                const modelData = {
                    ...formData,
                    name: formData.name || '', // Ensure name is not undefined
                    model: formData.model || formData.name || '' // Use model if set, otherwise use name
                };

                // Make sure both name and model are set and not empty
                if (!modelData.name) {
                    alert('Please enter a name for the model');
                    return;
                }

                if (!modelData.model) {
                    modelData.model = modelData.name; // Force model to be the same as name if empty
                }

                const newModel = await ollamaService.createModel(modelData);
                setModels(Array.isArray(models) ? [...models, newModel] : [newModel]);
                setSelectedModel(newModel);
                setFormData({
                    name: newModel.name || '',
                    model: newModel.model || '',
                    censored: newModel.censored || false,
                    embedding: (selectedModel.ollamaShow.capabilities || []).includes("embedding") || false,
                    tools: (selectedModel.ollamaShow.capabilities || []).includes("tools") || false,
                    vision: (selectedModel.ollamaShow.capabilities || []).includes("vision") || false,
                    details: selectedModel.ollamaModel.details || null
                });
            } else if (isEditing && selectedModel) {
                // Ensure details are preserved when updating
                const modelToUpdate = {
                    ...formData,
                    name: formData.name,
                    model: formData.name,
                    details: selectedModel.ollamaModel.details || formData.details,
                    size: selectedModel.size,
                };

                // Make sure both name and model are set and not empty
                if (!modelToUpdate.name) {
                    alert('Please enter a name for the model');
                    return;
                }

                if (!modelToUpdate.model) {
                    modelToUpdate.model = modelToUpdate.name; // Force model to be the same as name if empty
                }

                const updatedModel = await ollamaService.updateModel(selectedModel.id, modelToUpdate);
                if (Array.isArray(models)) {
                    setModels(models.map(model => model.id === updatedModel.id ? updatedModel : model));
                }
                setSelectedModel(updatedModel);
                setFormData({
                    name: updatedModel.name,
                    censored: updatedModel.censored || false,
                    embedding: (selectedModel.ollamaShow.capabilities || []).includes("embedding") || false,
                    tools: (selectedModel.ollamaShow.capabilities || []).includes("tools") || false,
                    vision: (selectedModel.ollamaShow.capabilities || []).includes("vision") || false,
                    details: selectedModel.ollamaModel.details || null
                });
            }
            setIsEditing(false);
            setIsCreating(false);
        } catch (error) {
            alert('Error creating model: ' + error.message);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setIsCreating(false);
    };

    const handleInlineDataChange = async (e) => {
        const newCensoredValue = e.target.checked;
        
        try {
            // Determine if this is a native model (not yet configured) or an existing model
            const isNativeModel = availableInstalledModels.some(
                model => model.ollamaModel.model === selectedModel.ollamaModel.model
            );

            if (isNativeModel) {
                // Create new model with censored value
                const modelData = {
                    name: selectedModel.ollamaModel.model,
                    model: selectedModel.ollamaModel.model,
                    censored: newCensoredValue,
                    embedding: (selectedModel.ollamaShow?.capabilities || []).includes("embedding") || false,
                    tools: (selectedModel.ollamaShow?.capabilities || []).includes("tools") || false,
                    vision: (selectedModel.ollamaShow?.capabilities || []).includes("vision") || false,
                    details: selectedModel.ollamaModel.details || null
                };

                const newModel = await ollamaService.createModel(modelData);
                setModels(Array.isArray(models) ? [...models, newModel] : [newModel]);
                setSelectedModel(newModel);

                toast(
                    "Model successfully added", {
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
            } else {
                // Update existing model
                const modelToUpdate = {
                    name: selectedModel.name,
                    model: selectedModel.name,
                    censored: newCensoredValue,
                    details: selectedModel.ollamaModel.details,
                    size: selectedModel.size,
                };

                const updatedModel = await ollamaService.updateModel(selectedModel.id, modelToUpdate);

                if (Array.isArray(models)) {
                    setModels(models.map(model => model.id === updatedModel.id ? updatedModel : model));
                }

                setSelectedModel(updatedModel);

                toast(
                    "Model successfully updated", {
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
            }
        } catch (error) {
            toast.error('Failed to save model: ' + error.message);
        }
    };

    const handleSaveNativeModel = async () => {
        try {
            // Create new model with default values (censored: false)
            const modelData = {
                name: selectedModel.ollamaModel.model,
                model: selectedModel.ollamaModel.model,
                censored: false,
                embedding: (selectedModel.ollamaShow?.capabilities || []).includes("embedding") || false,
                tools: (selectedModel.ollamaShow?.capabilities || []).includes("tools") || false,
                vision: (selectedModel.ollamaShow?.capabilities || []).includes("vision") || false,
                details: selectedModel.ollamaModel.details || null
            };

            const newModel = await ollamaService.createModel(modelData);
            setModels(Array.isArray(models) ? [...models, newModel] : [newModel]);
            setSelectedModel(newModel);

            toast(
                "Model successfully added", {
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
            toast.error('Failed to save model: ' + error.message);
        }
    };

    const renderModelsList = () => {
        return (
            <div className="models-list">
                <ul>
                    {Array.isArray(models) && models.map(model => (
                        <li
                            key={model.ollamaModel.model}
                            className={selectedModel && selectedModel.ollamaModel.model === model.ollamaModel.model ? 'selected' : ''}
                            onClick={() => handleSelectModel(model)}
                        >
                            <div className="ollama-model-icon"><BoltIcon/></div>
                            <div>{model.ollamaModel.model}</div>
                        </li>
                    ))}

                    {Array.isArray(availableInstalledModels) && availableInstalledModels.map(installedModel => (
                        <li
                            key={installedModel.ollamaModel.model}
                            className={selectedModel && selectedModel.ollamaModel.model === installedModel.ollamaModel.model ? 'selected' : ''}
                            onClick={() => handleSelectModel(installedModel)}
                        >
                            <div className="ollama-model-icon"><BoltSlashIcon/></div>
                            <div>{installedModel.ollamaModel.model}</div>
                        </li>
                    ))
                    }
                </ul>
            </div>
        );
    };

    const renderModelForm = () => {
        return (
            <form onSubmit={handleSubmit} className="model-form">
                <div className="model-details">
                    <div className="model-details-header">
                        <h3>{formData.name || selectedModel?.name || selectedModel?.ollamaModel?.model || ''}</h3>
                    </div>
                </div>

                <div className="form-group checkbox">
                    <input
                        type="checkbox"
                        id="censored"
                        name="censored"
                        checked={formData.censored}
                        onChange={handleInputChange}
                    />
                    <label htmlFor="censored">Censored</label>
                </div>

                <div className="form-actions">
                    <button type="submit" className="save-button">
                        {isCreating ? 'Create' : 'Save'}
                    </button>
                    <button type="button" className="cancel-button" onClick={handleCancel}>
                        Cancel
                    </button>
                </div>
            </form>
        );
    };

    const renderModelDetails = () => {
        if (!selectedModel) return null;

        // Determine if this is a native model (not yet configured) or an existing model
        const isNativeModel = availableInstalledModels.some(
            m => m.ollamaModel.model === selectedModel.ollamaModel.model
        );

        return (
            <div className="model-details">
                <ToastContainer />
                <div className="model-details-header">
                    <h3>{selectedModel.name}</h3>
                    {isNativeModel && (
                        <button
                            onClick={handleSaveNativeModel}
                            className="edit-model-button"
                            title="Save model"
                        >
                            <CheckIcon className="icon" />
                        </button>
                    )}
                </div>

                <div className="model-info">
                    <p><strong>Model:</strong> {selectedModel.name}</p>
                    <p><strong>Size:</strong> {selectedModel.ollamaModel.details.parameter_size} MB</p>

                    <div className="model-features">
                        <p><strong>Features:</strong></p>
                        <ul>
                            <li className={`editable-feature ${selectedModel.censored ? 'active' : ''}`}>
                                <input
                                    type="checkbox"
                                    id="inline-censored"
                                    checked={selectedModel.censored || false}
                                    onChange={handleInlineDataChange}
                                />
                                <label htmlFor="inline-censored">Censored</label>
                            </li>
                            <li className={(selectedModel.ollamaShow.capabilities || []).includes("embedding") ? 'active' : ''}>Embedding</li>
                            <li className={(selectedModel.ollamaShow.capabilities || []).includes("tools") ? 'active' : ''}>Tools</li>
                            <li className={(selectedModel.ollamaShow.capabilities || []).includes("vision") ? 'active' : ''}>Vision</li>
                        </ul>
                    </div>

                    {selectedModel.ollamaModel && (
                        <div className="model-details-section">
                            <p><strong>Details:</strong></p>
                            <ul>
                                {selectedModel.ollamaModel.details.parent_model &&
                                    <li><strong>Parent Model:</strong> {selectedModel.details.parentModel}</li>}
                                {selectedModel.ollamaModel.details.format &&
                                    <li><strong>Format:</strong> {selectedModel.ollamaModel.details.format}</li>}
                                {selectedModel.ollamaModel.details.family &&
                                    <li><strong>Family:</strong> {selectedModel.ollamaModel.details.family}</li>}
                                {selectedModel.ollamaModel.details.parameter_size &&
                                    <li><strong>Parameter Size:</strong> {selectedModel.ollamaModel.details.parameter_size}</li>}
                                {selectedModel.ollamaModel.details.quantization_level &&
                                    <li><strong>Quantization Level:</strong> {selectedModel.ollamaModel.details.quantization_level}</li>}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="ollama-model-settings-container">
            {renderModelsList()}

            <div className="model-content">
                {(isEditing || isCreating) ? renderModelForm() : renderModelDetails()}
            </div>
        </div>
    );
};

export default OllamaModelSettings;
