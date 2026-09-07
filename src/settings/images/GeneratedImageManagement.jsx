import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Navigate, NavLink, useParams} from "react-router";
import {FiAlertCircle} from "react-icons/fi";
import log from "loglevel";

import generatedImageService from "../../service/GeneratedImageService.js";
import {useKeycloak} from "../../providers/KeycloakProvider.jsx";
import {DEFAULT_IMAGE_LEVEL, findImageLevel, visibleImageLevels} from "./imageLevels.js";
import GeneratedImageCard from "./GeneratedImageCard.jsx";
import "./GeneratedImageManagement.css";

const IMAGE_PAGE_SIZE = 20;

const replaceImage = (images, updatedImage) => {
    return images.map((image) => image.imageId === updatedImage.imageId ? updatedImage : image);
};

const removeImage = (images, imageId) => {
    return images.filter((image) => image.imageId !== imageId);
};

const GeneratedImageManagement = () => {
    const {level} = useParams();
    const {hasRole} = useKeycloak();

    const [images, setImages] = useState([]);
    const [loadedPages, setLoadedPages] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadErrorMessage, setLoadErrorMessage] = useState("");
    const [userIdFilterInput, setUserIdFilterInput] = useState("");
    const [appliedUserIdFilter, setAppliedUserIdFilter] = useState("");

    const sentinelRef = useRef(null);
    const loadGenerationRef = useRef(0);
    const loadingMoreRef = useRef(false);

    const imageLevel = findImageLevel(level);
    const availableLevels = visibleImageLevels(hasRole);
    const levelAllowed = Boolean(imageLevel) && availableLevels.some((candidate) => candidate.level === imageLevel.level);
    const isAdmin = imageLevel?.scope === "ADMIN";

    const identity = `${imageLevel?.level ?? ""}:${isAdmin ? appliedUserIdFilter : ""}`;
    const [loadedIdentity, setLoadedIdentity] = useState(identity);

    // Reset during render, not in an effect, so no stale-collection frame ever commits — same
    // approach RagManagement uses when its collection identity changes.
    if (loadedIdentity !== identity) {
        loadGenerationRef.current += 1;
        setLoadedIdentity(identity);
        setImages([]);
        setLoadedPages(0);
        setTotalPages(0);
        setLoadErrorMessage("");
    }

    const hasMoreImages = loadedPages > 0 && loadedPages < totalPages;

    const fetchPage = useCallback((page) => {
        if (isAdmin) {
            return generatedImageService.findAllImages(
                appliedUserIdFilter ? {userId: appliedUserIdFilter} : {},
                page,
                IMAGE_PAGE_SIZE,
            );
        }

        return generatedImageService.findMyImages(page, IMAGE_PAGE_SIZE);
    }, [isAdmin, appliedUserIdFilter]);

    const loadFirstPage = useCallback(async () => {
        if (!imageLevel) {
            return;
        }

        const generation = loadGenerationRef.current;

        try {
            const paged = await fetchPage(0);

            if (generation !== loadGenerationRef.current) {
                return;
            }

            setImages(paged?.content ?? []);
            setTotalPages(paged?.page?.totalPages ?? 0);
            setLoadedPages(1);
            setLoadErrorMessage("");
        } catch (caughtError) {
            if (generation !== loadGenerationRef.current) {
                return;
            }

            log.error('[GeneratedImageManagement] Failed to load images:', caughtError);
            setLoadErrorMessage(`Error loading images: ${caughtError}`);
        }
    }, [imageLevel, fetchPage]);

    const loadNextPage = useCallback(async () => {
        if (loadingMoreRef.current || loadedPages === 0 || loadedPages >= totalPages) {
            return;
        }

        const generation = loadGenerationRef.current;
        loadingMoreRef.current = true;
        setLoadingMore(true);

        try {
            const paged = await fetchPage(loadedPages);

            if (generation !== loadGenerationRef.current) {
                return;
            }

            setImages((currentImages) => [...currentImages, ...(paged?.content ?? [])]);
            setTotalPages(paged?.page?.totalPages ?? 0);
            setLoadedPages((currentLoadedPages) => currentLoadedPages + 1);
            setLoadErrorMessage("");
        } catch (caughtError) {
            if (generation !== loadGenerationRef.current) {
                return;
            }

            log.error('[GeneratedImageManagement] Failed to load more images:', caughtError);
            setLoadErrorMessage(`Error loading images: ${caughtError}`);
        } finally {
            loadingMoreRef.current = false;
            setLoadingMore(false);
        }
    }, [fetchPage, loadedPages, totalPages]);

    useEffect(() => {
        return () => {
            loadGenerationRef.current += 1;
        };
    }, []);

    useEffect(() => {
        void loadFirstPage();
    }, [loadFirstPage]);

    useEffect(() => {
        const sentinel = sentinelRef.current;

        if (!sentinel || !hasMoreImages || typeof IntersectionObserver === "undefined") {
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                void loadNextPage();
            }
        });

        observer.observe(sentinel);

        return () => observer.disconnect();
    }, [hasMoreImages, loadNextPage]);

    const handleUserIdFilterSubmit = (event) => {
        event.preventDefault();
        setAppliedUserIdFilter(userIdFilterInput.trim());
    };

    const handleRenamed = useMemo(() => (updatedImage) => {
        setImages((currentImages) => replaceImage(currentImages, updatedImage));
    }, []);

    const handleDeleted = useMemo(() => (imageId) => {
        setImages((currentImages) => removeImage(currentImages, imageId));
    }, []);

    if (!levelAllowed) {
        return <Navigate to={`/settings/images/${DEFAULT_IMAGE_LEVEL}`} replace/>;
    }

    return (
        <div className="generated-image-management">
            <h2>Images</h2>
            <p className="settings-content-subtitle">
                Images you've generated. Rename them for easier recognition, or delete the ones you no longer need.
            </p>

            {availableLevels.length > 1 && (
                <div className="generated-image-tab-bar">
                    {availableLevels.map((candidate) => (
                        <NavLink
                            key={candidate.level}
                            to={`/settings/images/${candidate.level}`}
                            className={({isActive}) => `generated-image-tab ${isActive ? "active" : ""}`}
                        >
                            {candidate.label}
                            {candidate.requiresRole && <span className="settings-admin-badge">Admin</span>}
                        </NavLink>
                    ))}
                </div>
            )}

            <p className="generated-image-level-description">{imageLevel.description}</p>

            {isAdmin && (
                <form className="generated-image-filter-form" onSubmit={handleUserIdFilterSubmit}>
                    <label className="generated-image-filter-label" htmlFor="userIdFilter">
                        Filter by user ID
                    </label>
                    <input
                        id="userIdFilter"
                        type="text"
                        className="generated-image-filter-input"
                        value={userIdFilterInput}
                        onChange={(event) => setUserIdFilterInput(event.target.value)}
                        placeholder="All users"
                    />
                    <button type="submit" className="generated-image-filter-apply">Apply</button>
                </form>
            )}

            {loadErrorMessage && (
                <div className="generated-image-status-message generated-image-status-message-error">
                    <FiAlertCircle/>
                    {loadErrorMessage}
                </div>
            )}

            {images.length > 0 ? (
                <>
                    <div className="generated-image-grid">
                        {images.map((image) => (
                            <GeneratedImageCard
                                key={image.imageId}
                                image={image}
                                isAdmin={isAdmin}
                                onRenamed={handleRenamed}
                                onDeleted={handleDeleted}
                            />
                        ))}
                    </div>

                    {hasMoreImages && (
                        <div ref={sentinelRef} className="generated-image-sentinel" aria-hidden="true"/>
                    )}

                    <div className="generated-image-loading-more" role="status" aria-live="polite">
                        {loadingMore ? "Loading more images..." : ""}
                    </div>
                </>
            ) : (
                !loadErrorMessage && <div className="generated-image-empty-hint">No images yet.</div>
            )}
        </div>
    );
};

export default GeneratedImageManagement;
