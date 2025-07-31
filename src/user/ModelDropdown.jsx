import modelProps from "./UserPropTypes.js";
import userPreferencesService from "../service/UserPreferencesService.js";

import {ToastContainer, toast, Bounce} from 'react-toastify';

const ModelDropdown = ({selectedModel, setSelectedModel, models}) => {

    const handleModelChange = (event) => {
        const selectedFromDropdown = event.target.value;

        const preferenceData = {model: selectedFromDropdown};

        userPreferencesService.update(preferenceData).then(updatedPreferences => {
            const updatedModelName = updatedPreferences.model;
            const modelDetails = models.find(model => model.name === updatedModelName);
            setSelectedModel(modelDetails);
            toast(
                "Model updated: " + updatedModelName, {
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
        });
    };

    return (
        <div className="model-selection-container">
            <ToastContainer/>
            <div className="model-select-label">Chat Model:</div>
            <select
                id="model-select"
                value={selectedModel.name}
                onChange={handleModelChange}
                className="model-select-dropdown"
            >
                {!selectedModel && <option value="">--Select a model--</option>}
                {models.map((model, index) => (
                    <option key={index} value={model.model}>
                        {model.name}
                    </option>
                ))}
            </select>
        </div>
    )
}

ModelDropdown.propTypes = modelProps;

export default ModelDropdown;
