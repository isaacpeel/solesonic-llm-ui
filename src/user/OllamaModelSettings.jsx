import {useState, useEffect} from 'react';
import ollamaService from '../service/OllamaService.js';
import './OllamaModelSettings.css';
import {BoltIcon, BoltSlashIcon, DocumentArrowDownIcon, ChevronLeftIcon, ArrowPathIcon, TrashIcon} from "@heroicons/react/24/solid";
import {ToastContainer, toast, Bounce} from 'react-toastify';

const OllamaModelSettings = () => {
    const [models, setModels] = useState([]);
    const [installedModels, setInstalledModels] = useState([]);
    const [availableInstalledModels, setAvailableInstalledModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [mobileView, setMobileView] = useState('list');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        censored: false,
    });

    useEffect(() => {
        fetchModels();
        fetchInstalledModels();
    }, []);

    useEffect(() => {
        if (installedModels.length > 0 && Array.isArray(models) && models.length > 0) {
            const configuredModelNames = models.map(model => model.ollamaModel.model);
            const available = installedModels.filter(model => !configuredModelNames.includes(model.ollamaModel.model));
            setAvailableInstalledModels(available);
        } else if (installedModels.length > 0) {
            setAvailableInstalledModels(installedModels);
        }
    }, [installedModels, models]);

    const fetchModels = async () => {
        try {
            const modelsList = await ollamaService.models();
            const modelsArray = Array.isArray(modelsList) ? modelsList : [];
            setModels(modelsArray);
            if (modelsArray.length > 0 && !selectedModel) {
                setSelectedModel(modelsArray[0]);
            }
        } catch (error) {
            toast.error('Error fetching models: ' + error.message);
            setModels([]);
        }
    };

    const fetchInstalledModels = async () => {
        try {
            const installed = await ollamaService.installedModels();
            const installedArray = Array.isArray(installed) ? installed : [];
            setInstalledModels(installedArray);
        } catch (error) {
            toast.error('Error fetching installed models: ' + error.message);
            setInstalledModels([]);
        }
    };

    const handleRefreshModels = async () => {
        setIsRefreshing(true);

        try {
            await ollamaService.refreshModels();
            await fetchInstalledModels();

            toast("Ollama models refreshed", {
                position: "top-right",
                autoClose: 2500,
                hideProgressBar: true,
                closeOnClick: true,
                pauseOnHover: false,
                draggable: false,
                theme: "dark",
                transition: Bounce,
            });
        } catch (error) {
            toast.error('Error refreshing models: ' + error.message);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleSelectModel = (model) => {
        setSelectedModel(model);
        setIsEditing(false);
        setIsCreating(false);
        setMobileView('detail');
    };

    const handleMobileBack = () => {
        setMobileView('list');
    };

    const handleInputChange = (event) => {
        const {name: fieldName, value, type, checked} = event.target;

        const isNativeSelected = selectedModel && availableInstalledModels.some(
            model => model.ollamaModel.model === selectedModel.ollamaModel.model
        );
        if (isCreating && isNativeSelected && fieldName === 'name') {
            return;
        }

        const updatedData = {
            ...formData,
            [fieldName]: type === 'checkbox' ? checked : value
        };

        if (fieldName === 'name') {
            updatedData.model = value;
        }
        setFormData(updatedData);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        try {
            if (isCreating) {
                const modelData = {
                    ...formData,
                    name: formData.name || '',
                    model: formData.model || formData.name || ''
                };

                if (!modelData.name) {
                    toast.error('Please enter a name for the model');
                    return;
                }

                if (!modelData.model) {
                    modelData.model = modelData.name;
                }

                const newModel = await ollamaService.createModel(modelData);
                setModels(Array.isArray(models) ? [...models, newModel] : [newModel]);
                setSelectedModel(newModel);
                setFormData({
                    name: newModel.name || '',
                    model: newModel.model || '',
                    censored: newModel.censored || false,
                });
            } else if (isEditing && selectedModel) {
                const modelToUpdate = {
                    ...formData,
                    name: formData.name,
                    model: formData.name,
                    details: selectedModel.ollamaModel.details || formData.details,
                    size: selectedModel.ollamaModel.details.parameter_size,
                };

                if (!modelToUpdate.name) {
                    toast.error('Please enter a name for the model');
                    return;
                }

                if (!modelToUpdate.model) {
                    modelToUpdate.model = modelToUpdate.name;
                }

                const updatedModel = await ollamaService.updateModel(selectedModel.id, modelToUpdate);
                if (Array.isArray(models)) {
                    setModels(models.map(model => model.id === updatedModel.id ? updatedModel : model));
                }
                setSelectedModel(updatedModel);
                setFormData({
                    name: updatedModel.name,
                    censored: updatedModel.censored || false,
                });
            }
            setIsEditing(false);
            setIsCreating(false);
        } catch (error) {
            toast.error('Error saving model: ' + error.message);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setIsCreating(false);
    };

    const handleInlineDataChange = async (event) => {
        const newCensoredValue = event.target.checked;

        try {
            const isNativeModel = availableInstalledModels.some(
                model => model.ollamaModel.model === selectedModel.ollamaModel.model
            );

            if (isNativeModel) {
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

                toast("Model successfully added", {
                    position: "top-right",
                    autoClose: 2500,
                    hideProgressBar: true,
                    closeOnClick: true,
                    pauseOnHover: false,
                    draggable: false,
                    theme: "dark",
                    transition: Bounce,
                });
            } else {
                const modelToUpdate = {
                    name: selectedModel.name,
                    model: selectedModel.name,
                    censored: newCensoredValue,
                    details: selectedModel.ollamaModel.details,
                    size: selectedModel.ollamaModel.details.parameter_size,
                };

                const updatedModel = await ollamaService.updateModel(selectedModel.id, modelToUpdate);

                if (Array.isArray(models)) {
                    setModels(models.map(model => model.id === updatedModel.id ? updatedModel : model));
                }

                setSelectedModel(updatedModel);

                toast("Model successfully updated", {
                    position: "top-right",
                    autoClose: 2500,
                    hideProgressBar: true,
                    closeOnClick: true,
                    pauseOnHover: false,
                    draggable: false,
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

            toast("Model successfully added", {
                position: "top-right",
                autoClose: 2500,
                hideProgressBar: true,
                closeOnClick: true,
                pauseOnHover: false,
                draggable: false,
                theme: "dark",
                transition: Bounce,
            });
        } catch (error) {
            toast.error('Failed to save model: ' + error.message);
        }
    };

    const handleDeleteModel = async () => {
        if (!selectedModel) {
            return;
        }

        const modelName = selectedModel.name || selectedModel.ollamaModel?.model || 'this model';
        if (!window.confirm(`Delete configuration for "${modelName}"?`)) {
            return;
        }

        try {
            await ollamaService.deleteModel(selectedModel.id);

            const remainingModels = Array.isArray(models)
                ? models.filter(model => model.id !== selectedModel.id)
                : [];
            setModels(remainingModels);
            setSelectedModel(remainingModels.length > 0 ? remainingModels[0] : null);
            setMobileView('list');

            toast("Model deleted", {
                position: "top-right",
                autoClose: 2500,
                hideProgressBar: true,
                closeOnClick: true,
                pauseOnHover: false,
                draggable: false,
                theme: "dark",
                transition: Bounce,
            });
        } catch (error) {
            toast.error('Failed to delete model: ' + error.message);
        }
    };

    const renderModelForm = () => {
        return (
            <form onSubmit={handleSubmit} className="model-form">
                <div className="model-form-header">
                    <h3>{formData.name || selectedModel?.name || selectedModel?.ollamaModel?.model || ''}</h3>
                </div>

                <div className="form-group checkbox-group">
                    <label className="toggle-switch-wrapper" htmlFor="form-censored">
                        <div className="toggle-switch">
                            <input
                                type="checkbox"
                                id="form-censored"
                                name="censored"
                                checked={formData.censored}
                                onChange={handleInputChange}
                            />
                            <span className="toggle-slider" />
                        </div>
                        <div className="toggle-label">
                            <span className="toggle-name">Censored</span>
                            <span className="toggle-description">Filter explicit content from responses</span>
                        </div>
                    </label>
                </div>

                <div className="form-actions">
                    <button type="submit" className="btn-primary">
                        {isCreating ? 'Create' : 'Save'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={handleCancel}>
                        Cancel
                    </button>
                </div>
            </form>
        );
    };

    const renderModelDetails = () => {
        if (!selectedModel) {
            return (
                <div className="model-empty-state">
                    <p>Select a model to view its details.</p>
                </div>
            );
        }

        const isNativeModel = availableInstalledModels.some(
            model => model.ollamaModel.model === selectedModel.ollamaModel.model
        );

        const capabilities = selectedModel.ollamaShow?.capabilities || [];
        const details = selectedModel.ollamaModel?.details || {};
        const modelName = selectedModel.name || selectedModel.ollamaModel?.model || '';

        return (
            <div className="model-detail-content">
                <div className="model-detail-header">
                    <div className="model-detail-title-row">
                        <h2 className="model-detail-name">{modelName}</h2>
                        <span className={`model-status-badge ${isNativeModel ? 'status-available' : 'status-configured'}`}>
                            {isNativeModel ? 'Not Added' : 'Configured'}
                        </span>
                    </div>

                    {isNativeModel && (
                        <button className="btn-add-model" onClick={handleSaveNativeModel}>
                            <DocumentArrowDownIcon className="btn-icon" />
                            Add Model
                        </button>
                    )}

                    {!isNativeModel && (
                        <button className="btn-delete-model" onClick={handleDeleteModel}>
                            <TrashIcon className="btn-icon" />
                            Delete Model
                        </button>
                    )}
                </div>

                {(details.parameter_size || details.family || details.format || details.quantization_level) && (
                    <div className="model-specs-grid">
                        {details.parameter_size && (
                            <div className="spec-item">
                                <span className="spec-label">Size</span>
                                <span className="spec-value">{details.parameter_size}</span>
                            </div>
                        )}
                        {details.family && (
                            <div className="spec-item">
                                <span className="spec-label">Family</span>
                                <span className="spec-value">{details.family}</span>
                            </div>
                        )}
                        {details.format && (
                            <div className="spec-item">
                                <span className="spec-label">Format</span>
                                <span className="spec-value">{details.format}</span>
                            </div>
                        )}
                        {details.quantization_level && (
                            <div className="spec-item">
                                <span className="spec-label">Quantization</span>
                                <span className="spec-value">{details.quantization_level}</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="model-detail-section">
                    <h4 className="detail-section-title">Capabilities</h4>
                    <div className="capabilities-list">
                        <span className={`capability-badge ${capabilities.includes('embedding') ? 'active' : ''}`}>
                            Embedding
                        </span>
                        <span className={`capability-badge ${capabilities.includes('tools') ? 'active' : ''}`}>
                            Tools
                        </span>
                        <span className={`capability-badge ${capabilities.includes('vision') ? 'active' : ''}`}>
                            Vision
                        </span>
                    </div>
                </div>

                <div className="model-detail-section">
                    <h4 className="detail-section-title">Settings</h4>
                    <label className="toggle-switch-wrapper" htmlFor="inline-censored">
                        <div className="toggle-switch">
                            <input
                                type="checkbox"
                                id="inline-censored"
                                checked={selectedModel.censored || false}
                                onChange={handleInlineDataChange}
                            />
                            <span className="toggle-slider" />
                        </div>
                        <div className="toggle-label">
                            <span className="toggle-name">Censored</span>
                            <span className="toggle-description">Filter explicit content from responses</span>
                        </div>
                    </label>
                </div>
            </div>
        );
    };
    return (
        <div className="ollama-model-settings-container">
            <ToastContainer />

            <div className={`models-sidebar ${mobileView === 'detail' ? 'mobile-hidden' : ''}`}>
                <div className="models-sidebar-header">
                    <span className="models-sidebar-title">Ollama Models</span>
                    <button
                        type="button"
                        className="btn-refresh-models"
                        onClick={handleRefreshModels}
                        disabled={isRefreshing}
                        title="Refresh available models"
                    >
                        <ArrowPathIcon className={`btn-icon ${isRefreshing ? 'spinning' : ''}`} />
                    </button>
                </div>

                {Array.isArray(models) && models.length > 0 && (
                    <div className="model-section">
                        <div className="model-section-label">Configured</div>
                        {models.map(model => (
                            <div
                                key={model.ollamaModel.model}
                                className={`model-list-item ${selectedModel?.ollamaModel?.model === model.ollamaModel.model ? 'selected' : ''}`}
                                onClick={() => handleSelectModel(model)}
                            >
                                <span className="model-list-icon configured">
                                    <BoltIcon />
                                </span>
                                <span className="model-list-name">{model.ollamaModel.model}</span>
                                {model.ollamaModel.details?.parameter_size && (
                                    <span className="model-list-size">{model.ollamaModel.details.parameter_size}</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {Array.isArray(availableInstalledModels) && availableInstalledModels.length > 0 && (
                    <div className="model-section">
                        <div className="model-section-label">Available to Add</div>
                        {availableInstalledModels.map(model => (
                            <div
                                key={model.ollamaModel.model}
                                className={`model-list-item unconfigured ${selectedModel?.ollamaModel?.model === model.ollamaModel.model ? 'selected' : ''}`}
                                onClick={() => handleSelectModel(model)}
                            >
                                <span className="model-list-icon">
                                    <BoltSlashIcon />
                                </span>
                                <span className="model-list-name">{model.ollamaModel.model}</span>
                                {model.ollamaModel.details?.parameter_size && (
                                    <span className="model-list-size">{model.ollamaModel.details.parameter_size}</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className={`model-detail-panel ${mobileView === 'list' ? 'mobile-hidden' : ''}`}>
                <button className="mobile-back-button" onClick={handleMobileBack}>
                    <ChevronLeftIcon className="back-icon" />
                    Models
                </button>

                {(isEditing || isCreating) ? renderModelForm() : renderModelDetails()}
            </div>
        </div>
    );
};

export default OllamaModelSettings;
