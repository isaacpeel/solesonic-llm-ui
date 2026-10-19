import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {FiAlertCircle} from "react-icons/fi";
import log from "loglevel";

import memoryService from "../../service/MemoryService.js";
import MemoryRow from "./MemoryRow.jsx";
import AddMemoryForm from "./AddMemoryForm.jsx";
import ForgetAllMemoriesDialog from "./ForgetAllMemoriesDialog.jsx";
import {KIND_SECTIONS, MEMORY_ORIGINS, MEMORY_STATUSES, ORIGIN_LABELS} from "./memoryLabels.js";
import "./MyMemories.css";

const EMPTY_MESSAGE = "Nothing learned yet. Memories appear here after a conversation has been quiet for a while.";
const NO_MATCH_MESSAGE = "No memories match the filter.";
const LOAD_FAILED_MESSAGE = "Could not load your memories.";

const ORIGIN_FILTERS = [MEMORY_ORIGINS.INFERRED, MEMORY_ORIGINS.REMEMBERED, MEMORY_ORIGINS.AUTHORED];

const STATUS_ORDER = {
    [MEMORY_STATUSES.ACTIVE]: 0,
    [MEMORY_STATUSES.PENDING]: 1,
};

const timestampOf = (timestamp) => (timestamp ? new Date(timestamp).getTime() : 0);

const compareWithinSection = (left, right) => {
    const statusDifference = (STATUS_ORDER[left.status] ?? 2) - (STATUS_ORDER[right.status] ?? 2);

    if (statusDifference !== 0) {
        return statusDifference;
    }

    return timestampOf(right.lastConfirmed) - timestampOf(left.lastConfirmed);
};

const replaceMemory = (memories, updatedMemory) => {
    return memories.map((memory) => memory.id === updatedMemory.id ? updatedMemory : memory);
};

const removeMemory = (memories, memoryId) => {
    return memories.filter((memory) => memory.id !== memoryId);
};

const MyMemories = () => {
    const [memories, setMemories] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [selectedOrigins, setSelectedOrigins] = useState([]);
    const [showForgetDialog, setShowForgetDialog] = useState(false);

    const loadGenerationRef = useRef(0);

    const loadMemories = useCallback(async () => {
        loadGenerationRef.current += 1;
        const generation = loadGenerationRef.current;

        try {
            const foundMemories = await memoryService.findMemories();

            if (generation !== loadGenerationRef.current) {
                return;
            }

            setMemories(foundMemories ?? []);
            setLoadFailed(false);
            setLoaded(true);
        } catch (caughtError) {
            if (generation !== loadGenerationRef.current) {
                return;
            }

            log.error('[MyMemories] Failed to load memories', caughtError);
            setLoadFailed(true);
            setLoaded(true);
        }
    }, []);

    useEffect(() => {
        void loadMemories();
    }, [loadMemories]);

    useEffect(() => {
        return () => {
            loadGenerationRef.current += 1;
        };
    }, []);

    const sections = useMemo(() => {
        const normalizedSearch = searchText.trim().toLowerCase();

        const visibleMemories = memories.filter((memory) => {
            const matchesSearch = !normalizedSearch || (memory.content ?? "").toLowerCase().includes(normalizedSearch);
            const matchesOrigin = selectedOrigins.length === 0 || selectedOrigins.includes(memory.origin);

            return matchesSearch && matchesOrigin;
        });

        return KIND_SECTIONS
            .map((section) => ({
                ...section,
                memories: visibleMemories.filter((memory) => memory.kind === section.kind).sort(compareWithinSection),
            }))
            .filter((section) => section.memories.length > 0);
    }, [memories, searchText, selectedOrigins]);

    const toggleOrigin = (origin) => {
        setSelectedOrigins((currentOrigins) => (
            currentOrigins.includes(origin)
                ? currentOrigins.filter((candidate) => candidate !== origin)
                : [...currentOrigins, origin]
        ));
    };

    const applyLocalChange = (change) => {
        loadGenerationRef.current += 1;
        setMemories(change);
        setLoaded(true);
    };

    const handleCreated = (createdMemory) => {
        applyLocalChange((currentMemories) => [createdMemory, ...currentMemories]);
    };

    const handleChanged = (updatedMemory) => {
        applyLocalChange((currentMemories) => replaceMemory(currentMemories, updatedMemory));
    };

    const handleDeleted = (memoryId) => {
        applyLocalChange((currentMemories) => removeMemory(currentMemories, memoryId));
    };

    const handleGone = (memoryId) => {
        handleDeleted(memoryId);
        void loadMemories();
    };

    const handleForgotten = () => {
        setShowForgetDialog(false);
        applyLocalChange([]);
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

            {loadFailed && (
                <div className="memory-status-message memory-status-message-error" role="alert">
                    <FiAlertCircle aria-hidden="true"/>
                    {LOAD_FAILED_MESSAGE}
                    <button type="button" className="memory-button" onClick={() => void loadMemories()}>
                        Retry
                    </button>
                </div>
            )}

            {memories.length > 0 && (
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

            {loaded && !loadFailed && memories.length === 0 && (
                <p className="memory-empty-hint">{EMPTY_MESSAGE}</p>
            )}

            {memories.length > 0 && sections.length === 0 && (
                <p className="memory-empty-hint">{NO_MATCH_MESSAGE}</p>
            )}

            {memories.length > 0 && (
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
