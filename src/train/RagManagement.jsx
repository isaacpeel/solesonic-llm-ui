import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Navigate, NavLink, useParams} from "react-router";
import {FiTrash2, FiRefreshCw, FiUploadCloud, FiFile, FiX, FiCheckCircle, FiAlertCircle} from "react-icons/fi";
import {PiQueueFill} from "react-icons/pi";
import log from "loglevel";

import documentService from "../service/DocumentService.js";
import userPreferencesService from "../service/UserPreferencesService.js";
import {useKeycloak} from "../providers/KeycloakProvider.jsx";
import {useSharedData} from "../context/useSharedData.jsx";
import {DEFAULT_RAG_LEVEL, findRagLevel, visibleRagLevels} from "./ragLevels.js";
import {ROLES} from "../authorizer/roles.js";
import "./RagManagement.css";

const DOCUMENT_POLL_INTERVAL_MS = 5000;
const DOCUMENT_PAGE_SIZE = 20;

// A CHAT 404 means either no such chat of yours or no such document of that chat, and the
// API deliberately declines to say which. One message has to cover both.
const documentLoadErrorMessage = (scope, caughtError) => {
    if (scope === "CHAT" && caughtError?.status === 404) {
        return "This conversation's documents are unavailable.";
    }

    return `Error loading documents: ${caughtError}`;
};

const mergeFirstPage = (currentDocuments, incomingDocuments) => {
    const incomingById = new Map(incomingDocuments.map((incoming) => [incoming.id, incoming]));
    const knownIds = new Set(currentDocuments.map((currentDocument) => currentDocument.id));

    const refreshed = currentDocuments.map((currentDocument) => {
        return incomingById.get(currentDocument.id) ?? currentDocument;
    });

    const added = incomingDocuments.filter((incoming) => !knownIds.has(incoming.id));

    return [...added, ...refreshed];
};

const appendPage = (currentDocuments, incomingDocuments) => {
    const knownIds = new Set(currentDocuments.map((currentDocument) => currentDocument.id));

    return [...currentDocuments, ...incomingDocuments.filter((incoming) => !knownIds.has(incoming.id))];
};

const STATUS_CLASS = {
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

const RagManagement = () => {
    const {level} = useParams();
    const {hasRole} = useKeycloak();
    const {chatId} = useSharedData();

    const [file, setFile] = useState(null);
    const [fileName, setFileName] = useState(null);
    const [statusMessage, setStatusMessage] = useState("");
    const [statusType, setStatusType] = useState("success");
    const [isDragging, setIsDragging] = useState(false);
    const [files, setFiles] = useState([]);
    const [loadedPages, setLoadedPages] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const [threshold, setThreshold] = useState(0.7);
    const [savingThreshold, setSavingThreshold] = useState(false);
    const fileInputRef = useRef(null);
    const sentinelRef = useRef(null);
    const loadGenerationRef = useRef(0);

    const ragLevel = findRagLevel(level);
    const availableLevels = visibleRagLevels(hasRole);
    const levelAllowed = Boolean(ragLevel) && availableLevels.some((candidate) => candidate.level === ragLevel.level);

    const scope = ragLevel?.scope;
    const preferenceKey = ragLevel?.preferenceKey;
    const chatIdForScope = ragLevel?.requiresChatId ? chatId : null;
    const documentsUnavailable = Boolean(ragLevel?.requiresChatId) && !chatId;
    const hasMoreDocuments = loadedPages > 0 && loadedPages < totalPages;

    const identifiers = useMemo(() => ({chatId: chatIdForScope}), [chatIdForScope]);

    const loadFirstPage = useCallback(async () => {
        if (!scope || documentsUnavailable) {
            return;
        }

        const generation = loadGenerationRef.current;

        try {
            const paged = await documentService.findIngestedDocuments(scope, identifiers, 0, DOCUMENT_PAGE_SIZE);

            if (generation !== loadGenerationRef.current) {
                return;
            }

            const ingestedDocuments = paged?.content ?? [];
            setFiles((currentFiles) => mergeFirstPage(currentFiles, ingestedDocuments));
            setTotalPages(paged?.page?.totalPages ?? 0);
            setLoadedPages((currentLoadedPages) => Math.max(currentLoadedPages, 1));
        } catch (caughtError) {
            if (generation !== loadGenerationRef.current) {
                return;
            }

            setStatusType("error");
            setStatusMessage(documentLoadErrorMessage(scope, caughtError));
        }
    }, [scope, identifiers, documentsUnavailable]);

    const loadNextPage = useCallback(async () => {
        if (loadingMore || loadedPages === 0 || loadedPages >= totalPages) {
            return;
        }

        const generation = loadGenerationRef.current;
        setLoadingMore(true);

        try {
            const paged = await documentService.findIngestedDocuments(
                scope,
                identifiers,
                loadedPages,
                DOCUMENT_PAGE_SIZE,
            );

            if (generation !== loadGenerationRef.current) {
                return;
            }

            setFiles((currentFiles) => appendPage(currentFiles, paged?.content ?? []));
            setTotalPages(paged?.page?.totalPages ?? 0);
            setLoadedPages((currentLoadedPages) => currentLoadedPages + 1);
        } catch (caughtError) {
            if (generation !== loadGenerationRef.current) {
                return;
            }

            setStatusType("error");
            setStatusMessage(documentLoadErrorMessage(scope, caughtError));
        } finally {
            setLoadingMore(false);
        }
    }, [scope, identifiers, loadedPages, totalPages, loadingMore]);

    useEffect(() => {
        if (!preferenceKey) {
            return;
        }

        userPreferencesService.get()
            .then((userPreferences) => {
                if (userPreferences[preferenceKey] !== undefined) {
                    setThreshold(userPreferences[preferenceKey]);
                }
            })
            .catch((caughtError) => {
                log.error('[RagManagement] Failed to load preferences:', caughtError);
            });
    }, [preferenceKey]);

    useEffect(() => {
        loadGenerationRef.current += 1;
        setFiles([]);
        setLoadedPages(0);
        setTotalPages(0);
    }, [scope, chatIdForScope]);

    // The listing is newest-first, so every document whose status is still moving sits on the
    // first page. Polling it alone keeps statuses live without re-fetching what has been scrolled.
    useEffect(() => {
        void loadFirstPage();

        const intervalId = setInterval(() => {
            if (typeof document !== "undefined" && document.hidden) {
                return;
            }

            void loadFirstPage();
        }, DOCUMENT_POLL_INTERVAL_MS);

        return () => clearInterval(intervalId);
    }, [loadFirstPage]);

    useEffect(() => {
        const sentinel = sentinelRef.current;

        if (!sentinel || !hasMoreDocuments || typeof IntersectionObserver === "undefined") {
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                void loadNextPage();
            }
        });

        observer.observe(sentinel);

        return () => observer.disconnect();
    }, [hasMoreDocuments, loadNextPage]);

    if (!levelAllowed) {
        return <Navigate to={`/settings/rag/${DEFAULT_RAG_LEVEL}`} replace/>;
    }

    const selectFile = (selectedFile) => {
        if (!selectedFile) {
            return;
        }

        setFile(selectedFile);
        setFileName(selectedFile.name);
        setStatusMessage("");
    };

    const handleFileChange = (event) => {
        selectFile(event.target.files[0]);
    };

    const handleClearFile = () => {
        setFile(null);
        setFileName(null);

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleDragOver = (event) => {
        event.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (event) => {
        event.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setIsDragging(false);
        selectFile(event.dataTransfer.files[0]);
    };

    const handleThresholdSubmit = async (event) => {
        event.preventDefault();
        setSavingThreshold(true);

        try {
            await userPreferencesService.patch({[preferenceKey]: parseFloat(Number(threshold).toFixed(2))});
            setStatusType("success");
            setStatusMessage("Similarity threshold updated.");
        } catch (caughtError) {
            setStatusType("error");
            setStatusMessage(`Error updating similarity threshold: ${caughtError}`);
        } finally {
            setSavingThreshold(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await documentService.deleteIngestedDocument(id, scope, identifiers);
            setFiles((currentFiles) => currentFiles.filter((currentFile) => currentFile.id !== id));
        } catch (caughtError) {
            setStatusType("error");
            setStatusMessage(`Error deleting file: ${caughtError}`);
        }
    };

    const handleRefresh = async (id) => {
        try {
            await documentService.refreshIngestedDocument(id, scope, identifiers);
            await loadFirstPage();
        } catch (caughtError) {
            setStatusType("error");
            setStatusMessage(`Error refreshing file: ${caughtError}`);
        }
    };

    const handleProcessQueue = async () => {
        try {
            await documentService.processDocumentQueue();
            setStatusType("success");
            setStatusMessage("Document queue processing started.");
            await loadFirstPage();
        } catch (caughtError) {
            setStatusType("error");
            setStatusMessage(`Error processing document queue: ${caughtError}`);
        }
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

        try {
            await documentService.uploadDocument(formData, scope, identifiers);
            setStatusType("success");
            setStatusMessage("File uploaded successfully!");
            handleClearFile();
            await loadFirstPage();
        } catch (caughtError) {
            setStatusType("error");
            setStatusMessage(`Error uploading file: ${caughtError}`);
        }
    };

    return (
        <div className="rag-management">
            <div className="rag-header-row">
                <h2>RAG</h2>

                {ragLevel.scope === "GLOBAL" && hasRole(ROLES.RAG_ADMIN) && (
                    <button
                        type="button"
                        className="rag-process-queue-button"
                        onClick={handleProcessQueue}
                        aria-label="Process document queue"
                        data-tooltip="Process Document Queue"
                    >
                        <PiQueueFill/>
                    </button>
                )}
            </div>

            <p className="settings-content-subtitle">
                Documents used to ground retrieval-augmented responses, scoped by level.
            </p>

            <div className="rag-tab-bar">
                {availableLevels.map((candidate) => (
                    <NavLink
                        key={candidate.level}
                        to={`/settings/rag/${candidate.level}`}
                        className={({isActive}) => `rag-tab ${isActive ? "active" : ""}`}
                    >
                        {candidate.label}
                        {candidate.requiresRole && <span className="settings-admin-badge">Admin</span>}
                    </NavLink>
                ))}
            </div>

            <form onSubmit={handleThresholdSubmit} className="rag-threshold-form">
                <div className="rag-field">
                    <label className="rag-field-label" htmlFor="similarityThreshold">
                        Similarity threshold
                    </label>
                    <input
                        id="similarityThreshold"
                        className="rag-field-input"
                        type="number"
                        value={threshold}
                        onChange={(event) => setThreshold(parseFloat(event.target.value))}
                        step="0.01"
                        min="0"
                        max="1"
                    />
                </div>

                <button type="submit" className="rag-threshold-save-button" disabled={savingThreshold}>
                    {savingThreshold ? "Saving..." : "Save"}
                </button>
            </form>

            <p className="rag-threshold-description">{ragLevel.description}</p>

            <div className="rag-section-divider"></div>
            <div className="rag-docs-heading">{ragLevel.documentsHeading}</div>

            {documentsUnavailable ? (
                <div className="rag-empty-state">{ragLevel.noChatMessage}</div>
            ) : (
                <>
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
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
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
                                    <FiFile className="rag-dropzone-file-icon"/>
                                    <span className="rag-dropzone-file-name">{fileName}</span>
                                    <button
                                        type="button"
                                        className="rag-dropzone-clear-button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            handleClearFile();
                                        }}
                                        aria-label="Remove selected file"
                                        title="Remove file"
                                    >
                                        <FiX/>
                                    </button>
                                </div>
                            ) : (
                                <div className="rag-dropzone-placeholder">
                                    <FiUploadCloud className="rag-dropzone-icon"/>
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

                    {files.length > 0 && (
                        <div className="rag-file-processing-files-container">
                            <div className="rag-file-processing-files-header">
                                <div className="rag-file-processing-files-header-filename">File Name</div>
                                <div className="rag-file-processing-files-header-status">Status</div>
                                <div className="rag-file-processing-files-header-actions">Actions</div>
                            </div>

                            {files.map((ingestedDocument) => (
                                <div key={ingestedDocument.id} className="rag-file-processing-row-container">
                                    <div className="rag-file-processing-row-filename">{ingestedDocument.fileName}</div>
                                    <div className="rag-file-processing-row-meta">
                                        <div
                                            className={`rag-file-processing-row-status ${STATUS_CLASS[ingestedDocument.documentStatus]}`}>
                                            {ingestedDocument.documentStatus.replace(/_/g, " ")}
                                        </div>
                                        <div className="rag-file-processing-row-actions">
                                            <button
                                                type="button"
                                                className="rag-file-refresh-button"
                                                onClick={() => handleRefresh(ingestedDocument.id)}
                                                aria-label={`Refresh ${ingestedDocument.fileName}`}
                                                title="Refresh document"
                                            >
                                                <FiRefreshCw/>
                                            </button>
                                            <button
                                                type="button"
                                                className="rag-file-delete-button"
                                                onClick={() => handleDelete(ingestedDocument.id)}
                                                aria-label={`Delete ${ingestedDocument.fileName}`}
                                                title="Delete document"
                                            >
                                                <FiTrash2/>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {hasMoreDocuments && (
                                <div ref={sentinelRef} className="rag-file-processing-sentinel">
                                    {loadingMore ? "Loading more documents..." : ""}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {statusMessage && (
                <div className={`rag-file-upload-status-message rag-file-upload-status-message-${statusType}`}>
                    {statusType === "success" ? <FiCheckCircle/> : <FiAlertCircle/>}
                    {statusMessage}
                </div>
            )}
        </div>
    );
};

export default RagManagement;
