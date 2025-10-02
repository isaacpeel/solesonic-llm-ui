import {formatSize} from "../util/formatFunctions.js";
import {CheckIcon, XCircleIcon} from "@heroicons/react/16/solid/index.js";
import modelProps from "./UserPropTypes.js";

const ModelDetails = ({selectedModel}) => {
    return (
        <div className="model-details-container">
            <h2>Model Details</h2>
            <div className="model-detail">
                <strong>Name:</strong> {selectedModel.name}
            </div>
            <div className="model-detail">
                <strong>Model:</strong> {selectedModel.model}
            </div>
            <div className="model-detail">
                <strong>Size:</strong>{" "}
                {selectedModel && selectedModel.size
                    ? formatSize(selectedModel.size)
                    : "N/A"}
            </div>

            <div className="model-details-extra">
                <h3>Details</h3>
                <div className="model-detail">
                    <strong>Tools:</strong>{" "}
                    {selectedModel.tools ? <CheckIcon height={16} width={16}/> :
                        <XCircleIcon height={16} width={16}/>}
                </div>
                <div className="model-detail">
                    <strong>Censored:</strong>{" "}
                    {selectedModel.censored ? <CheckIcon height={16} width={16}/> :
                        <XCircleIcon height={16} width={16}/>}
                </div>
                <div className="model-detail">
                    <strong>Embedding:</strong>{" "}
                    {selectedModel.embedding ? <CheckIcon height={16} width={16}/> :
                        <XCircleIcon height={16} width={16}/>}
                </div>
                <div className="model-detail">
                    <strong>Vision:</strong>{" "}
                    {selectedModel.vision ? <CheckIcon height={16} width={16}/> :
                        <XCircleIcon height={16} width={16}/>}
                </div>
                <div className="model-detail">
                    <strong>Parent Model:</strong>{" "}
                    {selectedModel.ollamaModel.details.parent_model || "N/A"}
                </div>
                <div className="model-detail">
                    <strong>Format:</strong>{" "}
                    {selectedModel.ollamaModel.details.format || "N/A"}
                </div>
                <div className="model-detail">
                    <strong>Family:</strong>{" "}
                    {selectedModel.ollamaModel.details.family || "N/A"}
                </div>
                <div className="model-detail">
                    <strong>Families:</strong>{" "}
                    {selectedModel.ollamaModel.details.families
                        ? selectedModel.ollamaModel.details.families.join(", ")
                        : "N/A"}
                </div>
                <div className="model-detail">
                    <strong>Parameter Size:</strong>{" "}
                    {selectedModel.ollamaModel.details.parameter_size || "N/A"}
                </div>
                <div className="model-detail">
                    <strong>Quantization Level:</strong>{" "}
                    {selectedModel.ollamaModel.details.quantization_level || "N/A"}
                </div>
            </div>
        </div>
    )
}

ModelDetails.propTypes = modelProps;

export default ModelDetails;