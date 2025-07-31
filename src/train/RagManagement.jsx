import {useEffect, useState, useRef} from "react";
import documentService from "../service/DocumentService.js";
import "./RagManagement.css";

const RagManagement = () => {
    const [file, setFile] = useState(null);
    const [fileName, setFileName] = useState(null);
    const [statusMessage, setStatusMessage] = useState(""); // State for status message
    const [files, setFiles] = useState([]);
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
        setFileName(e.target.files[0].name);
    };

    const getFiles = async () => {
        return await documentService.findTrainingDocuments();
    };

    useEffect(() => {
        // Initial fetch
        getFiles().then(files => setFiles(files));

        // Set up an interval to fetch the files every 5 seconds
        const intervalId = setInterval(() => {
            getFiles().then(files => setFiles(files));
        }, 5000); // 5000 ms = 5 seconds

        // Cleanup the interval when the component unmounts
        return () => clearInterval(intervalId);
    }, []);

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!file) {
            setStatusMessage("Select a file before uploading. ¯\\_(ツ\\_/¯");
            return;
        }
        setStatusMessage(""); // Reset status message

        const formData = new FormData();
        formData.append("file", file);

        await documentService.uploadDocument(formData)
            .then(() => {
                setStatusMessage("File uploaded successfully!");
                fileInputRef.current.value = "";
            }).catch((error) => {
                setStatusMessage(`Error uploading file: ${error}`);
            });
    };

    return (
        <div>
            <div className="rag-container">
                <form onSubmit={handleSubmit}>

                    <h2 style={{textAlign: "center", marginBottom: "20px"}}>Upload File to Train solesonic-llm</h2>

                    <div style={{marginBottom: "20px"}}>
                        <label
                            htmlFor="fileInput"
                            className="rag-file-input"
                        >
                            Choose A File
                        </label>

                        <input
                            type="file"
                            id="fileInput"
                            onChange={handleFileChange}
                            ref={fileInputRef}
                            style={{display: "none"}}
                        />
                        <div className="rag-file-input-name">{fileName}</div>
                    </div>

                    <button type="submit" className="rag-upload-file-button">
                        Upload File
                    </button>
                </form>

                {statusMessage && (
                    <div className="rag-file-upload-status-message">
                        {statusMessage}
                    </div>
                )}
            </div>

            <div className="rag-file-processing-container">
                {files.length > 0 && (
                    <div className="rag-file-processing-files-container">
                        <div className={"rag-file-processing-files-header"}>
                            <div className="rag-file-processing-files-header-filename">File Name</div>
                            <div className="rag-file-processing-files-header-status">Status</div>
                        </div>
                        {files.map((file) => {
                            const statusClass = {
                                IN_PROGRESS: "rag-file-processing-in-progress",
                                PREPARING: "rag-file-processing-preparing",
                                KEYWORD_ENRICHING: "rag-file-processing-keyword-enriching",
                                METADATA_ENRICHING: "rag-file-processing-metadata-enriching",
                                TOKEN_SPLITTING: "rag-file-processing-token-splitting",
                                QUEUED: "rag-file-processing-queued",
                                COMPLETED: "rag-file-processing-completed",
                                FAILED: "rag-file-processing-failed",
                                REPLACED: "rag-file-processing-replaced",
                            };

                            const formattedStatus = file.documentStatus.replace(/_/g, " ");

                            return (
                                <div key={file.id}
                                     className="rag-file-processing-row-container"
                                >
                                    <div className="rag-file-processing-row-filename">{file.fileName}</div>
                                    <div className={statusClass[file.documentStatus]}>
                                        {formattedStatus}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

        </div>
    );
};

export default RagManagement;
