import {useEffect, useState, useRef} from "react";
import {FiTrash2, FiRefreshCw, FiUploadCloud, FiFile, FiX, FiCheckCircle, FiAlertCircle} from "react-icons/fi";
import documentService from "../service/DocumentService.js";
import "./RagManagement.css";
import {PiQueueFill} from "react-icons/pi";

const RagManagement = () => {
    const [file, setFile] = useState(null);
    const [fileName, setFileName] = useState(null);
    const [statusMessage, setStatusMessage] = useState("");
    const [statusType, setStatusType] = useState("success"); // "success" | "error"
    const [isDragging, setIsDragging] = useState(false);
    const [files, setFiles] = useState([]);
    const fileInputRef = useRef(null);

    const selectFile = (selectedFile) => {
        if (!selectedFile) {
            return;
        }

        setFile(selectedFile);
        setFileName(selectedFile.name);
        setStatusMessage("");
    };

    const handleFileChange = (e) => {
        selectFile(e.target.files[0]);
    };

    const handleClearFile = () => {
        setFile(null);
        setFileName(null);

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        selectFile(e.dataTransfer.files[0]);
    };

    const getFiles = async () => {
        return await documentService.findIngestedDocuments();
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

    const handleDelete = async (id) => {
        await documentService.deleteIngestedDocument(id)
            .then(() => {
                setFiles((currentFiles) => currentFiles.filter((currentFile) => currentFile.id !== id));
            })
            .catch((error) => {
                setStatusType("error");
                setStatusMessage(`Error deleting file: ${error}`);
            });
    };

    const handleRefresh = async (id) => {
        await documentService.refreshIngestedDocument(id)
            .then(() => {
                getFiles().then((files) => setFiles(files));
            })
            .catch((error) => {
                setStatusType("error");
                setStatusMessage(`Error refreshing file: ${error}`);
            });
    };

    const handleProcessQueue = async () => {
        await documentService.processDocumentQueue()
            .then(() => {
                setStatusType("success");
                setStatusMessage("Document queue processing started.");
                getFiles().then((files) => setFiles(files));
            })
            .catch((error) => {
                setStatusType("error");
                setStatusMessage(`Error processing document queue: ${error}`);
            });
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!file) {
            setStatusType("error");
            setStatusMessage("Select a file before uploading.");
            return;
        }
        setStatusMessage("");

        const formData = new FormData();
        formData.append("file", file);

        await documentService.uploadDocument(formData)
            .then(() => {
                setStatusType("success");
                setStatusMessage("File uploaded successfully!");
                handleClearFile();
            }).catch((error) => {
                setStatusType("error");
                setStatusMessage(`Error uploading file: ${error}`);
            });
    };

    return (
        <div>
            <div className="rag-container">
                <div className="rag-card-header">
                    <h2 className="rag-title">Upload File to Train solesonic-llm</h2>

                    <button
                        type="button"
                        className="rag-process-queue-button"
                        onClick={handleProcessQueue}
                        aria-label="Process document queue"
                        data-tooltip="Process Document Queue"
                    >
                        <PiQueueFill />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div
                        className={[
                            "rag-dropzone",
                            isDragging ? "rag-dropzone-dragging" : "",
                            fileName ? "rag-dropzone-has-file" : "",
                        ].join(" ").trim()}
                        onClick={() => fileInputRef.current && fileInputRef.current.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                fileInputRef.current && fileInputRef.current.click();
                            }
                        }}
                    >
                        <input
                            type="file"
                            id="fileInput"
                            onChange={handleFileChange}
                            ref={fileInputRef}
                            className="rag-dropzone-input"
                        />

                        {fileName ? (
                            <div className="rag-dropzone-file">
                                <FiFile className="rag-dropzone-file-icon" />
                                <span className="rag-dropzone-file-name">{fileName}</span>
                                <button
                                    type="button"
                                    className="rag-dropzone-clear-button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleClearFile();
                                    }}
                                    aria-label="Remove selected file"
                                    title="Remove file"
                                >
                                    <FiX />
                                </button>
                            </div>
                        ) : (
                            <div className="rag-dropzone-placeholder">
                                <FiUploadCloud className="rag-dropzone-icon" />
                                <div className="rag-dropzone-text rag-dropzone-text-pointer">
                                    <strong>Click to browse</strong> or drag and drop a file here
                                </div>
                                <div className="rag-dropzone-text rag-dropzone-text-touch">
                                    <strong>Tap to browse</strong> for a file
                                </div>
                            </div>
                        )}
                    </div>

                    <button type="submit" className="rag-upload-file-button" disabled={!file}>
                        Upload File
                    </button>
                </form>

                {statusMessage && (
                    <div className={`rag-file-upload-status-message rag-file-upload-status-message-${statusType}`}>
                        {statusType === "success" ? <FiCheckCircle /> : <FiAlertCircle />}
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
                            <div className="rag-file-processing-files-header-actions">Actions</div>
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
                                    <div className="rag-file-processing-row-meta">
                                        <div className={`rag-file-processing-row-status ${statusClass[file.documentStatus]}`}>
                                            {formattedStatus}
                                        </div>
                                        <div className="rag-file-processing-row-actions">
                                            <button
                                                type="button"
                                                className="rag-file-refresh-button"
                                                onClick={() => handleRefresh(file.id)}
                                                aria-label={`Refresh ${file.fileName}`}
                                                title="Refresh document"
                                            >
                                                <FiRefreshCw />
                                            </button>
                                            <button
                                                type="button"
                                                className="rag-file-delete-button"
                                                onClick={() => handleDelete(file.id)}
                                                aria-label={`Delete ${file.fileName}`}
                                                title="Delete document"
                                            >
                                                <FiTrash2 />
                                            </button>
                                        </div>
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
