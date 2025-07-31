import { useState, useEffect } from 'react';
import ollamaService from '../service/OllamaService.js';
import './OllamaModelSettings.css';
import { PlusIcon, PencilIcon } from "@heroicons/react/24/solid";

const OllamaModelSettings = () => {
    const [models, setModels] = useState([]);
    const [installedModels, setInstalledModels] = useState([]);
    const [availableInstalledModels, setAvailableInstalledModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState(null);
    const [selectedInstalledModel, setSelectedInstalledModel] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        censored: false,
        embedding: false,
        tools: false,
        vision: false
    });

    useEffect(() => {
        fetchModels();
        fetchInstalledModels();
    }, []);

    useEffect(() => {
        // Filter out installed models that are already configured
        if (installedModels.length > 0 && Array.isArray(models) && models.length > 0) {
            const configuredModelNames = models.map(model => model.model);
            const available = installedModels.filter(model => !configuredModelNames.includes(model.model));
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
            alert(false, 'Error fetching models: ' + error.message);
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
            alert(false, 'Error fetching installed models: ' + error.message);
            setInstalledModels([]);
        }
    };

    const handleSelectModel = (model) => {
        setSelectedModel(model);
        setIsEditing(false);
        setIsCreating(false);
    };

    const handleEditClick = () => {
        const modelName = selectedModel.name;

        const editFormData = {
            name: modelName,
            censored: selectedModel.censored || false,
            embedding: selectedModel.embedding || false,
            tools: selectedModel.tools || false,
            vision: selectedModel.vision || false,
            details: selectedModel.details || null
        };

        setFormData(editFormData);
        setIsEditing(true);
        setIsCreating(false);
    };

    const handleCreateClick = () => {
        const initialFormData = {
            name: '',
            model: '',
            censored: false,
            embedding: false,
            tools: false,
            vision: false
        };
        setFormData(initialFormData);
        setSelectedInstalledModel('');
        setIsCreating(true);
        setIsEditing(false);
        setSelectedModel(null);
    };

    const handleInstalledModelSelect = (e) => {
        const modelName = e.target.value;
        setSelectedInstalledModel(modelName);

        if (modelName) {
            // Find the selected installed model
            const selectedModel = installedModels.find(model => model.name === modelName);

            if (selectedModel) {
                const modelName = selectedModel.model || '';

                const updatedFormData = {
                    name: modelName,
                    model: modelName,
                    censored: selectedModel.censored || false,
                    embedding: selectedModel.embedding || false,
                    tools: selectedModel.tools || false,
                    vision: selectedModel.vision || false
                };

                setFormData(updatedFormData);
            }
        } else {
            const resetFormData = {
                name: '',
                model: '',
                censored: false,
                embedding: false,
                tools: false,
                vision: false
            };
            setFormData(resetFormData);
        }
    };

    const handleInputChange = (e) => {
        const { name: fieldName, value, type, checked } = e.target;

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
                    embedding: newModel.embedding || false,
                    tools: newModel.tools || false,
                    vision: newModel.vision || false,
                    details: newModel.details || null
                });
            } else if (isEditing && selectedModel) {
                // Ensure details are preserved when updating
                const modelToUpdate = {
                    ...formData,
                    name: formData.name,
                    model: formData.name,
                    details: selectedModel.details || formData.details,
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
                    embedding: updatedModel.embedding || false,
                    tools: updatedModel.tools || false,
                    vision: updatedModel.vision || false,
                    details: updatedModel.details,
                    size: updatedModel.size,
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

    const renderModelsList = () => {
        return (
            <div className="models-list">
                <div className="models-list-header">
                    <h3>Ollama Models</h3>
                    <button 
                        className="create-model-button"
                        onClick={handleCreateClick}
                        title="Create new model"
                    >
                        <PlusIcon className="icon" />
                    </button>
                </div>
                <ul>
                    {Array.isArray(models) && models.map(model => (
                        <li 
                            key={model.id} 
                            className={selectedModel && selectedModel.id === model.id ? 'selected' : ''}
                            onClick={() => handleSelectModel(model)}
                        >
                            {model.name}
                        </li>
                    ))}
                </ul>
            </div>
        );
    };

    const renderModelForm = () => {
        return (
            <form onSubmit={handleSubmit} className="model-form">
                <h3>{isCreating ? 'Create New Model' : 'Edit Model'}</h3>

                {isCreating && (
                    <div className="form-group">
                        <label htmlFor="installedModel">Select Installed Model:</label>
                        <select
                            id="installedModel"
                            value={selectedInstalledModel}
                            onChange={handleInstalledModelSelect}
                            className="model-select-dropdown"
                        >
                            <option value="">-- Select an installed model --</option>
                            {Array.isArray(availableInstalledModels) && availableInstalledModels.map(model => (
                                <option key={model.id} value={model.id}>
                                    {model.name || model.model}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="form-group">
                    <label htmlFor="name">Name:</label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name || ''}
                        onChange={handleInputChange}
                        required
                        readOnly={!!(isCreating && selectedInstalledModel)}
                        className={isCreating && selectedInstalledModel ? 'readonly-input' : ''}
                    />
                    {isCreating && selectedInstalledModel && 
                        <small className="form-hint">Name is set from the selected model</small>
                    }
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

                <div className="form-group checkbox">
                    <input
                        type="checkbox"
                        id="embedding"
                        name="embedding"
                        checked={formData.embedding}
                        onChange={handleInputChange}
                    />
                    <label htmlFor="embedding">Embedding</label>
                </div>

                <div className="form-group checkbox">
                    <input
                        type="checkbox"
                        id="tools"
                        name="tools"
                        checked={formData.tools}
                        onChange={handleInputChange}
                    />
                    <label htmlFor="tools">Tools</label>
                </div>

                <div className="form-group checkbox">
                    <input
                        type="checkbox"
                        id="vision"
                        name="vision"
                        checked={formData.vision}
                        onChange={handleInputChange}
                    />
                    <label htmlFor="vision">Vision</label>
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

        return (
            <div className="model-details">
                <div className="model-details-header">
                    <h3>{selectedModel.name}</h3>
                    <button 
                        className="edit-model-button"
                        onClick={handleEditClick}
                        title="Edit model"
                    >
                        <PencilIcon className="icon" />
                    </button>
                </div>

                <div className="model-info">
                    <p><strong>Model:</strong> {selectedModel.name}</p>
                    <p><strong>Size:</strong> {Math.round(selectedModel.size / (1024 * 1024))} MB</p>

                    <div className="model-features">
                        <p><strong>Features:</strong></p>
                        <ul>
                            <li className={selectedModel.censored ? 'active' : ''}>Censored</li>
                            <li className={selectedModel.embedding ? 'active' : ''}>Embedding</li>
                            <li className={selectedModel.tools ? 'active' : ''}>Tools</li>
                            <li className={selectedModel.vision ? 'active' : ''}>Vision</li>
                        </ul>
                    </div>

                    {selectedModel.details && (
                        <div className="model-details-section">
                            <p><strong>Details:</strong></p>
                            <ul>
                                {selectedModel.details.parentModel && <li><strong>Parent Model:</strong> {selectedModel.details.parentModel}</li>}
                                {selectedModel.details.format && <li><strong>Format:</strong> {selectedModel.details.format}</li>}
                                {selectedModel.details.family && <li><strong>Family:</strong> {selectedModel.details.family}</li>}
                                {selectedModel.details.parameterSize && <li><strong>Parameter Size:</strong> {selectedModel.details.parameterSize}</li>}
                                {selectedModel.details.quantizationLevel && <li><strong>Quantization Level:</strong> {selectedModel.details.quantizationLevel}</li>}
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
