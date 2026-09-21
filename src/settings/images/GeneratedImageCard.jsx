import {useEffect, useRef, useState} from "react";
import {FiCheck, FiEdit2, FiTrash2, FiX} from "react-icons/fi";
import log from "loglevel";

import useGeneratedImageUrl from "../../hooks/useGeneratedImageUrl.js";
import generatedImageService from "../../service/GeneratedImageService.js";
import DeleteGeneratedImageDialog from "./DeleteGeneratedImageDialog.jsx";
import "./GeneratedImageCard.css";

const RENAME_FAILED_ERROR = "Could not rename the image. Please try again.";

/*
 * `name` is null until the owner renames it once — falls back to a truncated prompt the same
 * way a browser tab falls back to a URL when a page has no title.
 */
function displayNameFor(image) {
    if (image.name) {
        return image.name;
    }

    if (image.prompt) {
        return image.prompt.length > 60 ? `${image.prompt.slice(0, 60)}…` : image.prompt;
    }

    return "Untitled image";
}

function GeneratedImageCard({image, isAdmin, onRenamed, onDeleted}) {
    const [isVisible, setIsVisible] = useState(typeof IntersectionObserver === "undefined");
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState("");
    const [renameError, setRenameError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const frameRef = useRef(null);

    const {objectUrl, loading, error} = useGeneratedImageUrl(image.imageId, {deferred: !isVisible});

    useEffect(() => {
        if (isVisible || !frameRef.current) {
            return undefined;
        }

        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                setIsVisible(true);
            }
        }, {rootMargin: "200px"});

        observer.observe(frameRef.current);

        return () => observer.disconnect();
    }, [isVisible]);

    const label = displayNameFor(image);

    const startRenaming = () => {
        setRenameValue(image.name ?? "");
        setRenameError(null);
        setIsRenaming(true);
    };

    const cancelRenaming = () => {
        setIsRenaming(false);
        setRenameError(null);
    };

    const submitRename = async (event) => {
        event.preventDefault();

        const trimmedName = renameValue.trim();

        if (!trimmedName) {
            setRenameError("Name can't be blank.");
            return;
        }

        setSaving(true);
        setRenameError(null);

        try {
            const updatedImage = isAdmin
                ? await generatedImageService.renameImageAdmin(image.imageId, trimmedName)
                : await generatedImageService.renameImage(image.imageId, trimmedName);

            onRenamed(updatedImage);
            setIsRenaming(false);
        } catch (caughtError) {
            log.error('[GeneratedImageCard] Rename failed', image.imageId, caughtError);
            setRenameError(RENAME_FAILED_ERROR);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="generated-image-card">
            <div className="generated-image-card-frame" ref={frameRef}>
                {objectUrl && (
                    <img className="generated-image-card-picture" src={objectUrl} alt={label} loading="lazy"/>
                )}

                {loading && (
                    <div className="generated-image-card-frame-status" role="status">
                        <span className="generated-image-card-spinner" aria-label="Loading image"/>
                    </div>
                )}

                {error && (
                    <div className="generated-image-card-frame-status generated-image-card-frame-status--error">
                        {error === "missing" ? "No longer available" : "Could not load"}
                    </div>
                )}
            </div>

            <div className="generated-image-card-body">
                {isRenaming ? (
                    <form className="generated-image-card-rename-form" onSubmit={submitRename}>
                        <input
                            type="text"
                            className="generated-image-card-rename-input"
                            value={renameValue}
                            onChange={(event) => setRenameValue(event.target.value)}
                            disabled={saving}
                            autoFocus
                            maxLength={200}
                        />

                        <button
                            type="submit"
                            className="generated-image-card-rename-action"
                            disabled={saving}
                            aria-label="Save name"
                        >
                            <FiCheck/>
                        </button>

                        <button
                            type="button"
                            className="generated-image-card-rename-action"
                            disabled={saving}
                            onClick={cancelRenaming}
                            aria-label="Cancel rename"
                        >
                            <FiX/>
                        </button>
                    </form>
                ) : (
                    <div className="generated-image-card-title-row">
                        <span className="generated-image-card-title" title={label}>{label}</span>

                        <button
                            type="button"
                            className="generated-image-card-icon-button"
                            onClick={startRenaming}
                            aria-label={`Rename ${label}`}
                            title="Rename"
                        >
                            <FiEdit2/>
                        </button>
                    </div>
                )}

                {renameError && <div className="generated-image-card-error">{renameError}</div>}

                <div className="generated-image-card-meta">
                    {image.width && image.height && (
                        <span>{image.width}×{image.height}</span>
                    )}
                    {image.created && (
                        <span>{new Date(image.created).toLocaleDateString()}</span>
                    )}
                </div>

                {isAdmin && image.userId && (
                    <div className="generated-image-card-owner" title={image.userId}>
                        Owner: {image.userId}
                    </div>
                )}

                <div className="generated-image-card-actions">
                    <button
                        type="button"
                        className="generated-image-card-delete-button"
                        onClick={() => setShowDeleteDialog(true)}
                        aria-label={`Delete ${label}`}
                        title="Delete image"
                    >
                        <FiTrash2/>
                        Delete
                    </button>
                </div>
            </div>

            {showDeleteDialog && (
                <DeleteGeneratedImageDialog
                    imageId={image.imageId}
                    label={label}
                    hasChatMessage={Boolean(image.chatMessageId)}
                    isAdmin={isAdmin}
                    onCancel={() => setShowDeleteDialog(false)}
                    onDeleted={onDeleted}
                />
            )}
        </div>
    );
}

export default GeneratedImageCard;
