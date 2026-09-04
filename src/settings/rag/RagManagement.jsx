import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Navigate, NavLink, useParams} from "react-router";
import {FiTrash2, FiRefreshCw, FiCheckCircle, FiAlertCircle, FiUser, FiGlobe, FiPlus, FiLoader} from "react-icons/fi";
import {PiQueueFill} from "react-icons/pi";
import log from "loglevel";

import documentService from "../../service/DocumentService.js";
import userPreferencesService from "../../service/UserPreferencesService.js";
import {useKeycloak} from "../../providers/KeycloakProvider.jsx";
import {useSharedData} from "../../context/useSharedData.jsx";
import {DEFAULT_RAG_LEVEL, findRagLevel, visibleRagLevels} from "./ragLevels.js";
import {ROLES} from "../../authorizer/roles.js";
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

    const [statusMessage, setStatusMessage] = useState("");
    const [statusType, setStatusType] = useState("success");
    const [uploading, setUploading] = useState(false);
    const [files, setFiles] = useState([]);
    const [loadedPages, setLoadedPages] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadErrorMessage, setLoadErrorMessage] = useState("");
    const [threshold, setThreshold] = useState(0.7);
    const [savingThreshold, setSavingThreshold] = useState(false);
    const fileInputRef = useRef(null);
    const sentinelRef = useRef(null);
    const loadGenerationRef = useRef(0);
    const loadingMoreRef = useRef(false);
    const userPreferencesRef = useRef(null);

    const ragLevel = findRagLevel(level);
    const availableLevels = visibleRagLevels(hasRole);
    const levelAllowed = Boolean(ragLevel) && availableLevels.some((candidate) => candidate.level === ragLevel.level);

    const scope = ragLevel?.scope;
    const preferenceKey = ragLevel?.preferenceKey;
    const chatIdForScope = ragLevel?.requiresChatId ? chatId : null;
    const documentsUnavailable = Boolean(ragLevel?.requiresChatId) && !chatId;
    const collectionIdentity = `${scope ?? ""}:${chatIdForScope ?? ""}`;
    const [loadedCollectionIdentity, setLoadedCollectionIdentity] = useState(collectionIdentity);

    // Reset during render, not in an effect: an effect would leave one committed frame showing the
    // previous collection's rows while the action handlers below already point at the new one.
    if (loadedCollectionIdentity !== collectionIdentity) {
        loadGenerationRef.current += 1;
        setLoadedCollectionIdentity(collectionIdentity);
        setFiles([]);
        setLoadedPages(0);
        setTotalPages(0);
        setLoadErrorMessage("");
    }

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
            setLoadErrorMessage("");
        } catch (caughtError) {
            if (generation !== loadGenerationRef.current) {
                return;
            }

            setLoadErrorMessage(documentLoadErrorMessage(scope, caughtError));
        }
    }, [scope, identifiers, documentsUnavailable]);

    const loadNextPage = useCallback(async () => {
        if (loadingMoreRef.current || loadedPages === 0 || loadedPages >= totalPages) {
            return;
        }

        const generation = loadGenerationRef.current;
        loadingMoreRef.current = true;
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
            setLoadErrorMessage("");
        } catch (caughtError) {
            if (generation !== loadGenerationRef.current) {
                return;
            }

            setLoadErrorMessage(documentLoadErrorMessage(scope, caughtError));
        } finally {
            loadingMoreRef.current = false;
            setLoadingMore(false);
        }
    }, [scope, identifiers, loadedPages, totalPages]);

    useEffect(() => {
        if (!preferenceKey) {
            return;
        }

        userPreferencesService.get()
            .then((userPreferences) => {
                userPreferencesRef.current = userPreferences;

                if (userPreferences[preferenceKey] !== undefined) {
                    setThreshold(userPreferences[preferenceKey]);
                }
            })
            .catch((caughtError) => {
                log.error('[RagManagement] Failed to load preferences:', caughtError);
            });
    }, [preferenceKey]);

    // Discard whatever is still in flight when this screen goes away.
    useEffect(() => {
        return () => {
            loadGenerationRef.current += 1;
        };
    }, []);

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

    // Re-observing on every loadNextPage identity change is deliberate, not churn: observe() re-fires
    // an initial notification, so a page that leaves the sentinel still on screen keeps paging. A
    // stable observer would go quiet and strand a short page with nothing left to scroll.
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

    const uploadFile = async (selectedFile) => {
        if (!selectedFile || uploading) {
            return;
        }

        setStatusMessage("");
        setUploading(true);

        const formData = new FormData();
        formData.append("file", selectedFile);

        try {
            await documentService.uploadDocument(formData, scope, identifiers);
            setStatusType("success");
            setStatusMessage(`${selectedFile.name} uploaded successfully!`);
            await loadFirstPage();
        } catch (caughtError) {
            setStatusType("error");
            setStatusMessage(`Error uploading file: ${caughtError}`);
        } finally {
            setUploading(false);
        }
    };

    const handleFileChange = (event) => {
        const selectedFile = event.target.files[0];
        event.target.value = "";
        void uploadFile(selectedFile);
    };

    const handleDragOver = (event) => {
        event.preventDefault();
    };

    const handleDrop = (event) => {
        event.preventDefault();
        void uploadFile(event.dataTransfer.files[0]);
    };

    const handleThresholdSubmit = async (event) => {
        event.preventDefault();
        setSavingThreshold(true);

        try {
            const updatedPreferences = {
                ...userPreferencesRef.current,
                [preferenceKey]: parseFloat(Number(threshold).toFixed(2)),
            };
            userPreferencesRef.current = await userPreferencesService.update(updatedPreferences);
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
            await documentService.deleteIngestedDocument(id, scope);
            setFiles((currentFiles) => currentFiles.filter((currentFile) => currentFile.id !== id));
        } catch (caughtError) {
            setStatusType("error");
            setStatusMessage(`Error deleting file: ${caughtError}`);
        }
    };

    const handleRefresh = async (id) => {
        try {
            await documentService.refreshIngestedDocument(id, scope);
            await loadFirstPage();
        } catch (caughtError) {
            setStatusType("error");
            setStatusMessage(`Error refreshing file: ${caughtError}`);
        }
    };

    // Only reachable from the CHAT and USER tabs on a COMPLETED document (the buttons are not
    // rendered otherwise), but a refresh could race a promote and restart ingestion in between —
    // the 409 branches below still apply even though the UI tries to prevent them.
    const handlePromote = async (id, target) => {
        try {
            await documentService.promoteDocument(id, scope, target);
            setFiles((currentFiles) => currentFiles.filter((currentFile) => currentFile.id !== id));
            setStatusType("success");
            setStatusMessage(target === "global"
                ? "Document promoted to the global collection."
                : "Document promoted to your collection.");
        } catch (caughtError) {
            setStatusType("error");

            if (caughtError?.status === 409) {
                setStatusMessage(target === "global"
                    ? "A global document with this name already exists. Rename the file and try again."
                    : "This document can't be promoted yet — it may still be processing. Try again shortly.");
                return;
            }

            setStatusMessage(`Error promoting file: ${caughtError}`);
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

            <div className="rag-docs-heading-row">
                <div className="rag-docs-heading">{ragLevel.documentsHeading}</div>

                {!documentsUnavailable && (
                    <>
                        <button
                            type="button"
                            className="rag-add-file-button"
                            onClick={() => fileInputRef.current && fileInputRef.current.click()}
                            disabled={uploading}
                            aria-label="Add document"
                            data-tooltip="Add document"
                        >
                            {uploading ? <FiLoader className="rag-add-file-spinner"/> : <FiPlus/>}
                        </button>

                        <input
                            type="file"
                            id="fileInput"
                            onChange={handleFileChange}
                            ref={fileInputRef}
                            className="rag-visually-hidden-input"
                        />
                    </>
                )}
            </div>

            {loadErrorMessage && (
                <div className="rag-file-upload-status-message rag-file-upload-status-message-error">
                    <FiAlertCircle/>
                    {loadErrorMessage}
                </div>
            )}

            {statusMessage && (
                <div className={`rag-file-upload-status-message rag-file-upload-status-message-${statusType}`}>
                    {statusType === "success" ? <FiCheckCircle/> : <FiAlertCircle/>}
                    {statusMessage}
                </div>
            )}

            {documentsUnavailable ? (
                <div className="rag-upload-empty-hint">{ragLevel.noChatMessage}</div>
            ) : (
                <div onDragOver={handleDragOver} onDrop={handleDrop}>
                    {files.length > 0 ? (
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
                                            {scope === "CHAT" && ingestedDocument.documentStatus === "COMPLETED" && (
                                                <button
                                                    type="button"
                                                    className="rag-file-promote-button"
                                                    onClick={() => handlePromote(ingestedDocument.id, "user")}
                                                    aria-label={`Promote ${ingestedDocument.fileName} to your documents`}
                                                    title="Promote to your documents"
                                                >
                                                    <FiUser/>
                                                </button>
                                            )}
                                            {(scope === "CHAT" || scope === "USER") && ingestedDocument.documentStatus === "COMPLETED" && hasRole(ROLES.RAG_ADMIN) && (
                                                <button
                                                    type="button"
                                                    className="rag-file-promote-button"
                                                    onClick={() => handlePromote(ingestedDocument.id, "global")}
                                                    aria-label={`Promote ${ingestedDocument.fileName} to global documents`}
                                                    title="Promote to global documents"
                                                >
                                                    <FiGlobe/>
                                                </button>
                                            )}
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
                                <div ref={sentinelRef} className="rag-file-processing-sentinel" aria-hidden="true"/>
                            )}

                            <div className="rag-file-processing-loading-more" role="status" aria-live="polite">
                                {loadingMore ? "Loading more documents..." : ""}
                            </div>
                        </div>
                    ) : (
                        <div className="rag-upload-empty-hint">No documents yet.</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default RagManagement;
