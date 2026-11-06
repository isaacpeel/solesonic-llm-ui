import {useMemo, useState} from "react";
import {FiAlertCircle} from "react-icons/fi";

import memoryService from "../../service/MemoryService.js";
import usePagedList from "../../hooks/usePagedList.js";
import MemoryRow from "./MemoryRow.jsx";
import AddMemoryForm from "./AddMemoryForm.jsx";
import ForgetAllMemoriesDialog from "./ForgetAllMemoriesDialog.jsx";
import {KIND_SECTIONS, MEMORY_ORIGINS, MEMORY_STATUSES, ORIGIN_LABELS} from "./memoryLabels.js";
import {useMemorySearchParams} from "./memoryFilters.js";
import "./MyMemories.css";

const EMPTY_MESSAGE = "Nothing learned yet. Memories appear here after a conversation has been quiet for a while.";
const NO_MATCH_MESSAGE = "No memories match the filter.";
const LOAD_FAILED_MESSAGE = "Could not load your memories.";

const ORIGIN_FILTERS = [MEMORY_ORIGINS.INFERRED, MEMORY_ORIGINS.REMEMBERED, MEMORY_ORIGINS.AUTHORED];

const LISTED_STATUSES = [MEMORY_STATUSES.ACTIVE, MEMORY_STATUSES.PENDING];

const SORT_OPTIONS = [
    {value: "active", label: "Active first", sorts: ["status,asc", "lastConfirmed,desc"]},
    {value: "updated", label: "Recently updated", sorts: ["updated,desc"]},
    {value: "confirmed", label: "Recently confirmed", sorts: ["lastConfirmed,desc"]},
    {value: "confidence", label: "Highest confidence", sorts: ["confidence,desc"]},
    {value: "oldest", label: "Oldest first", sorts: ["created,asc"]},
];

const replaceMemory = (memories, updatedMemory) => {
    return memories.map((memory) => memory.id === updatedMemory.id ? updatedMemory : memory);
};

const removeMemory = (memories, memoryId) => {
    return memories.filter((memory) => memory.id !== memoryId);
};

const MyMemories = () => {
    const [searchText, setSearchText] = useState("");
    const [selectedOrigins, setSelectedOrigins] = useState([]);
    const [showForgetDialog, setShowForgetDialog] = useState(false);

    const {sortOption, changeSort} = useMemorySearchParams(SORT_OPTIONS);

    const filters = {
        statuses: LISTED_STATUSES,
        sorts: sortOption.sorts,
    };

    const {items, setItems, loaded, hasMore, loadingMore, loadError, sentinelRef, reload} = usePagedList(
        (page) => memoryService.findMemories(filters, page),
        JSON.stringify(filters),
    );

    const sections = useMemo(() => {
        const normalizedSearch = searchText.trim().toLowerCase();

        const visibleMemories = items.filter((memory) => {
            const matchesSearch = !normalizedSearch || (memory.content ?? "").toLowerCase().includes(normalizedSearch);
            const matchesOrigin = selectedOrigins.length === 0 || selectedOrigins.includes(memory.origin);

            return matchesSearch && matchesOrigin;
        });

        return KIND_SECTIONS
            .map((section) => ({
                ...section,
                memories: visibleMemories.filter((memory) => memory.kind === section.kind),
            }))
            .filter((section) => section.memories.length > 0);
    }, [items, searchText, selectedOrigins]);

    const toggleOrigin = (origin) => {
        setSelectedOrigins((currentOrigins) => (
            currentOrigins.includes(origin)
                ? currentOrigins.filter((candidate) => candidate !== origin)
                : [...currentOrigins, origin]
        ));
    };

    const handleCreated = (createdMemory) => {
        setItems((currentMemories) => [createdMemory, ...currentMemories]);
    };

    const handleChanged = (updatedMemory) => {
        setItems((currentMemories) => replaceMemory(currentMemories, updatedMemory));
    };

    const handleDeleted = (memoryId) => {
        setItems((currentMemories) => removeMemory(currentMemories, memoryId));
    };

    const handleGone = (memoryId) => {
        handleDeleted(memoryId);
        reload();
    };

    const handleForgotten = () => {
        setShowForgetDialog(false);
        setItems([]);
        reload();
    };

    return (
        <div className="my-memories">
            <div className="my-memories-explainer">
                <p>
                    Memory is what the assistant has learned about you from your conversations: facts, preferences
                    and standing instructions.
                </p>
                <p>
                    Only active memories reach the model on plain chat turns. Deleting a conversation or a message
                    forgets what was learned from it.
                </p>
            </div>

            <AddMemoryForm onCreated={handleCreated}/>

            {loadError && (
                <div className="memory-status-message memory-status-message-error" role="alert">
                    <FiAlertCircle aria-hidden="true"/>
                    {LOAD_FAILED_MESSAGE}
                    <button type="button" className="memory-button" onClick={reload}>
                        Retry
                    </button>
                </div>
            )}

            {items.length > 0 && (
                <div className="my-memories-filters">
                    <input
                        type="search"
                        className="memory-filter-input"
                        aria-label="Filter memories"
                        placeholder="Filter memories"
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                    />

                    {ORIGIN_FILTERS.map((origin) => (
                        <button
                            key={origin}
                            type="button"
                            className="my-memories-origin-chip"
                            aria-pressed={selectedOrigins.includes(origin)}
                            onClick={() => toggleOrigin(origin)}
                        >
                            {ORIGIN_LABELS[origin]}
                        </button>
                    ))}

                    <select
                        className="memory-filter-select my-memories-sort"
                        aria-label="Sort memories"
                        value={sortOption.value}
                        onChange={(event) => changeSort(event.target.value)}
                    >
                        {SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </div>
            )}

            {sections.map((section) => (
                <section key={section.kind} className="my-memories-section">
                    <h3 className="my-memories-section-heading">{section.heading}</h3>

                    <ul className="memory-list">
                        {section.memories.map((memory) => (
                            <MemoryRow
                                key={memory.id}
                                memory={memory}
                                onChanged={handleChanged}
                                onDeleted={handleDeleted}
                                onGone={handleGone}
                            />
                        ))}
                    </ul>
                </section>
            ))}

            {hasMore && <div ref={sentinelRef} className="memory-sentinel" aria-hidden="true"/>}

            <div className="memory-loading-more" role="status" aria-live="polite">
                {loadingMore ? "Loading more memories..." : ""}
            </div>

            {loaded && !loadError && items.length === 0 && (
                <p className="memory-empty-hint">{EMPTY_MESSAGE}</p>
            )}

            {items.length > 0 && sections.length === 0 && (
                <p className="memory-empty-hint">{NO_MATCH_MESSAGE}</p>
            )}

            {items.length > 0 && (
                <div className="my-memories-danger-zone">
                    <button
                        type="button"
                        className="my-memories-forget-button"
                        onClick={() => setShowForgetDialog(true)}
                    >
                        Forget everything
                    </button>
                </div>
            )}

            {showForgetDialog && (
                <ForgetAllMemoriesDialog
                    onCancel={() => setShowForgetDialog(false)}
                    onForgotten={handleForgotten}
                />
            )}
        </div>
    );
};

export default MyMemories;
