import {useEffect, useState} from "react";
import {FiAlertCircle} from "react-icons/fi";
import log from "loglevel";

import memoryService from "../../service/MemoryService.js";
import usePagedList from "../../hooks/usePagedList.js";
import {
    formatRelativeTimestamp,
    isEpoch,
    NO_ADMIN_ACCESS_MESSAGE,
    REFLECTION_STATUS_LABELS,
    REFLECTION_STATUSES,
    shortId,
    userLabel,
} from "./memoryLabels.js";
import {selectedFilterValues, subsetOrNone, useMemorySearchParams} from "./memoryFilters.js";
import "./MemoryReflections.css";

const LOAD_FAILED_MESSAGE = "Could not load reflections.";
const NOT_STARTED_LABEL = "Not started";

const SORT_OPTIONS = [
    {value: "updated", label: "Recently updated", sorts: []},
    {value: "attempts", label: "Most attempts", sorts: ["attempts,desc"]},
    {value: "behind", label: "Furthest behind", sorts: ["reflectedThrough,asc"]},
];

const STATUS_FILTERS = Object.values(REFLECTION_STATUSES);

const reflectionKey = (reflection) => reflection.chatId;

const reflectedThroughLabel = (reflectedThrough) => {
    if (isEpoch(reflectedThrough)) {
        return NOT_STARTED_LABEL;
    }

    return formatRelativeTimestamp(reflectedThrough) ?? "—";
};

const MemoryReflections = () => {
    const [maxAttempts, setMaxAttempts] = useState(null);

    const {
        searchParams,
        userIdFilter,
        sortOption,
        userIdInput,
        setUserIdInput,
        applyUserId,
        changeSort,
        toggleFilter,
    } = useMemorySearchParams(SORT_OPTIONS);

    const selectedStatuses = selectedFilterValues(searchParams, "status", STATUS_FILTERS);

    const filters = {
        userId: userIdFilter || undefined,
        statuses: subsetOrNone(selectedStatuses, STATUS_FILTERS),
        sorts: sortOption.sorts,
    };

    const {items, loaded, hasMore, loadingMore, loadError, sentinelRef, reload} = usePagedList(
        (page) => memoryService.findReflections(filters, page),
        JSON.stringify(filters),
        reflectionKey,
    );

    useEffect(() => {
        let cancelled = false;

        memoryService.getProcessingStatus()
            .then((processingStatus) => {
                if (!cancelled) {
                    setMaxAttempts(processingStatus?.reflection?.maxAttempts ?? null);
                }
            })
            .catch((caughtError) => {
                log.warn('[MemoryReflections] Max attempts unavailable', caughtError);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const handleUserIdSubmit = (event) => {
        event.preventDefault();
        applyUserId(userIdInput.trim());
    };

    if (loadError?.status === 403) {
        return (
            <div className="memory-status-message memory-status-message-error" role="alert">
                <FiAlertCircle aria-hidden="true"/>
                {NO_ADMIN_ACCESS_MESSAGE}
            </div>
        );
    }

    return (
        <div className="memory-reflections">
            <form className="memory-filter-form" onSubmit={handleUserIdSubmit}>
                <div className="memory-filter-field">
                    <label htmlFor="memory-reflections-user-id">User ID</label>
                    <div className="memory-filter-user-row">
                        <input
                            id="memory-reflections-user-id"
                            type="text"
                            className="memory-filter-input"
                            value={userIdInput}
                            onChange={(event) => setUserIdInput(event.target.value)}
                            placeholder="All users"
                        />
                        <button type="submit" className="memory-button">Apply</button>
                    </div>
                </div>

                <fieldset className="memory-filter-fieldset">
                    <legend>Status</legend>
                    {STATUS_FILTERS.map((status) => (
                        <label key={status} className="memory-filter-checkbox">
                            <input
                                type="checkbox"
                                checked={selectedStatuses.includes(status)}
                                onChange={() => toggleFilter("status", selectedStatuses, STATUS_FILTERS, status)}
                            />
                            {REFLECTION_STATUS_LABELS[status]}
                        </label>
                    ))}
                </fieldset>

                <div className="memory-filter-field">
                    <label htmlFor="memory-reflections-sort">Sort</label>
                    <select
                        id="memory-reflections-sort"
                        className="memory-filter-select"
                        value={sortOption.value}
                        onChange={(event) => changeSort(event.target.value)}
                    >
                        {SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </div>
            </form>

            {loadError && (
                <div className="memory-status-message memory-status-message-error" role="alert">
                    <FiAlertCircle aria-hidden="true"/>
                    {LOAD_FAILED_MESSAGE}
                    <button type="button" className="memory-button" onClick={reload}>Retry</button>
                </div>
            )}

            {items.length > 0 && (
                <>
                    <div className="memory-reflections-table-wrapper">
                        <table className="memory-reflections-table">
                            <thead>
                                <tr>
                                    <th scope="col">Conversation</th>
                                    <th scope="col">User</th>
                                    <th scope="col">Status</th>
                                    <th scope="col">Attempts</th>
                                    <th scope="col">Reflected through</th>
                                    <th scope="col">Updated</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((reflection) => {
                                    const failed = reflection.status === REFLECTION_STATUSES.FAILED;

                                    return (
                                        <tr
                                            key={reflection.chatId}
                                            className={`memory-reflection-row ${failed ? "memory-reflection-row-failed" : ""}`}
                                        >
                                            <td>
                                                <span className="memory-reflection-chat" title={reflection.chatId}>
                                                    {shortId(reflection.chatId)}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="memory-link-button"
                                                    title={reflection.userId}
                                                    onClick={() => applyUserId(reflection.userId)}
                                                >
                                                    {userLabel(reflection.username, reflection.userId)}
                                                </button>
                                            </td>
                                            <td>
                                                <span className={`memory-badge memory-badge-reflection-${(reflection.status ?? "").toLowerCase()}`}>
                                                    {REFLECTION_STATUS_LABELS[reflection.status] ?? reflection.status}
                                                </span>
                                            </td>
                                            <td className="memory-reflection-attempts">
                                                {maxAttempts === null
                                                    ? reflection.attempts
                                                    : `${reflection.attempts} / ${maxAttempts}`}
                                            </td>
                                            <td>{reflectedThroughLabel(reflection.reflectedThrough)}</td>
                                            <td>{formatRelativeTimestamp(reflection.updated) ?? "—"}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {hasMore && <div ref={sentinelRef} className="memory-sentinel" aria-hidden="true"/>}

                    <div className="memory-loading-more" role="status" aria-live="polite">
                        {loadingMore ? "Loading more reflections..." : ""}
                    </div>
                </>
            )}

            {loaded && items.length === 0 && !loadError && (
                <p className="memory-empty-hint">No reflections match these filters.</p>
            )}
        </div>
    );
};

export default MemoryReflections;
