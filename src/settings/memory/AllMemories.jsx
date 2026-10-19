import {FiAlertCircle} from "react-icons/fi";

import memoryService from "../../service/MemoryService.js";
import usePagedList from "../../hooks/usePagedList.js";
import {useKeycloak} from "../../providers/KeycloakProvider.jsx";
import MemoryRow from "./MemoryRow.jsx";
import {
    KIND_LABELS,
    KIND_SECTIONS,
    MEMORY_STATUSES,
    NO_ADMIN_ACCESS_MESSAGE,
    STATUS_LABELS,
} from "./memoryLabels.js";
import {selectedFilterValues, subsetOrNone, useMemorySearchParams} from "./memoryFilters.js";
import "./AllMemories.css";

const LOAD_FAILED_MESSAGE = "Could not load memories.";

const SORT_OPTIONS = [
    {value: "updated", label: "Recently updated", sorts: []},
    {value: "confidence", label: "Highest confidence", sorts: ["confidence,desc"]},
    {value: "confirmed", label: "Recently confirmed", sorts: ["lastConfirmed,desc"]},
    {value: "oldest", label: "Oldest first", sorts: ["created,asc"]},
    {value: "user", label: "By user", sorts: ["userId,asc", "updated,desc"]},
];

const STATUS_FILTERS = [MEMORY_STATUSES.ACTIVE, MEMORY_STATUSES.PENDING, MEMORY_STATUSES.SUPERSEDED];
const KIND_FILTERS = KIND_SECTIONS.map((section) => section.kind);

const mergeMemory = (memories, updatedMemory) => {
    return memories.map((memory) => (
        memory.id === updatedMemory.id
            ? {...memory, ...updatedMemory, id: memory.id, userId: memory.userId}
            : memory
    ));
};

const removeMemory = (memories, memoryId) => {
    return memories.filter((memory) => memory.id !== memoryId);
};

const AllMemories = () => {
    const {keycloak} = useKeycloak();
    const myUserId = keycloak?.tokenParsed?.sub ?? null;

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
    const selectedKinds = selectedFilterValues(searchParams, "kind", KIND_FILTERS);

    const filters = {
        userId: userIdFilter || undefined,
        statuses: subsetOrNone(selectedStatuses, STATUS_FILTERS),
        kinds: subsetOrNone(selectedKinds, KIND_FILTERS),
        sorts: sortOption.sorts,
    };

    const {items, setItems, loaded, hasMore, loadingMore, loadError, sentinelRef, reload} = usePagedList(
        (page) => memoryService.findAllMemories(filters, page),
        JSON.stringify(filters),
    );

    const handleUserIdSubmit = (event) => {
        event.preventDefault();
        applyUserId(userIdInput.trim());
    };

    const handleChanged = (updatedMemory) => {
        setItems((currentMemories) => mergeMemory(currentMemories, updatedMemory));
    };

    const handleDeleted = (memoryId) => {
        setItems((currentMemories) => removeMemory(currentMemories, memoryId));
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
        <div className="all-memories">
            <form className="memory-filter-form" onSubmit={handleUserIdSubmit}>
                <div className="memory-filter-field">
                    <label htmlFor="all-memories-user-id">User ID</label>
                    <div className="memory-filter-user-row">
                        <input
                            id="all-memories-user-id"
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
                            {STATUS_LABELS[status]}
                        </label>
                    ))}
                </fieldset>

                <fieldset className="memory-filter-fieldset">
                    <legend>Kind</legend>
                    {KIND_FILTERS.map((kind) => (
                        <label key={kind} className="memory-filter-checkbox">
                            <input
                                type="checkbox"
                                checked={selectedKinds.includes(kind)}
                                onChange={() => toggleFilter("kind", selectedKinds, KIND_FILTERS, kind)}
                            />
                            {KIND_LABELS[kind]}
                        </label>
                    ))}
                </fieldset>

                <div className="memory-filter-field">
                    <label htmlFor="all-memories-sort">Sort</label>
                    <select
                        id="all-memories-sort"
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
                    <ul className="memory-list">
                        {items.map((memory) => (
                            <MemoryRow
                                key={memory.id}
                                memory={memory}
                                ownerUserId={memory.userId}
                                isOwnMemory={memory.userId === myUserId}
                                showAdminColumns
                                onChanged={handleChanged}
                                onDeleted={handleDeleted}
                                onFilterUser={applyUserId}
                            />
                        ))}
                    </ul>

                    {hasMore && <div ref={sentinelRef} className="memory-sentinel" aria-hidden="true"/>}

                    <div className="memory-loading-more" role="status" aria-live="polite">
                        {loadingMore ? "Loading more memories..." : ""}
                    </div>
                </>
            )}

            {loaded && items.length === 0 && !loadError && (
                <p className="memory-empty-hint">No memories match these filters.</p>
            )}
        </div>
    );
};

export default AllMemories;
