import {useCallback, useEffect, useRef, useState} from "react";
import {Link} from "react-router";
import {FiAlertCircle, FiAlertTriangle, FiRefreshCw} from "react-icons/fi";
import log from "loglevel";

import memoryService from "../../service/MemoryService.js";
import {
    formatRelativeTimestamp,
    MEMORY_STATUSES,
    NO_ADMIN_ACCESS_MESSAGE,
    REFLECTION_STATUS_LABELS,
    REFLECTION_STATUSES,
    shortId,
    STATUS_LABELS,
} from "./memoryLabels.js";
import "./MemoryStatus.css";

const LOAD_FAILED_MESSAGE = "Could not load the memory processing status.";
const REFLECTION_DISABLED_WARNING = "Reflection is off. Nothing new will be learned.";

const RETRIEVAL_MODE_DESCRIPTIONS = {
    RELEVANT: "facts and preferences chosen per message",
    ALL: "every memory on every turn",
};

const SPRING_CRON_FIELD_COUNT = 6;

/*
 * Firings per hour for the simple six-field Spring crons the background jobs use (a fixed second
 * plus a minute step), so the Completed-last-hour count can be read against its ceiling. Anything
 * with an hour, day or month restriction returns null rather than a guess.
 */
const firingsPerHour = (cron) => {
    const fields = (cron ?? "").trim().split(/\s+/);

    if (fields.length !== SPRING_CRON_FIELD_COUNT) {
        return null;
    }

    const [seconds, minutes, ...coarserFields] = fields;
    const unrestricted = coarserFields.every((field) => field === "*" || field === "?");

    if (!/^\d+$/.test(seconds) || !unrestricted) {
        return null;
    }

    if (/^\d+$/.test(minutes)) {
        return 1;
    }

    if (minutes === "*") {
        return 60;
    }

    const stepMatch = /^[*0]\/(\d+)$/.exec(minutes);

    if (!stepMatch || Number(stepMatch[1]) === 0) {
        return null;
    }

    return Math.floor(59 / Number(stepMatch[1])) + 1;
};

const completedLastHourLabel = (reflection) => {
    const firings = firingsPerHour(reflection.cron);

    if (firings === null || typeof reflection.batchSize !== "number") {
        return String(reflection.completedLastHour ?? 0);
    }

    return `${reflection.completedLastHour ?? 0} of at most ${reflection.batchSize * firings}`;
};

const countOf = (counts, key) => String(counts?.[key] ?? 0);

function StatCard({title, headerExtra, children}) {
    return (
        <section className="memory-status-card">
            <header className="memory-status-card-header">
                <h3 className="memory-status-card-title">{title}</h3>
                {headerExtra}
            </header>
            <dl className="memory-status-stats">{children}</dl>
        </section>
    );
}

function Stat({label, value}) {
    return (
        <div className="memory-status-stat">
            <dt className="memory-status-stat-label">{label}</dt>
            <dd className="memory-status-stat-value">{value}</dd>
        </div>
    );
}

function EnabledPill({enabled}) {
    return (
        <span className={`memory-badge ${enabled ? "memory-badge-enabled" : "memory-badge-disabled"}`}>
            {enabled ? "Enabled" : "Disabled"}
        </span>
    );
}

const MemoryStatus = () => {
    const [status, setStatus] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const loadGenerationRef = useRef(0);

    const loadStatus = useCallback(async () => {
        loadGenerationRef.current += 1;
        const generation = loadGenerationRef.current;

        setRefreshing(true);

        try {
            const processingStatus = await memoryService.getProcessingStatus();

            if (generation !== loadGenerationRef.current) {
                return;
            }

            setStatus(processingStatus);
            setLoadError(null);
        } catch (caughtError) {
            if (generation !== loadGenerationRef.current) {
                return;
            }

            log.error('[MemoryStatus] Failed to load the processing status', caughtError);
            setLoadError(caughtError);
        } finally {
            if (generation === loadGenerationRef.current) {
                setRefreshing(false);
            }
        }
    }, []);

    useEffect(() => {
        void loadStatus();
    }, [loadStatus]);

    useEffect(() => {
        return () => {
            loadGenerationRef.current += 1;
        };
    }, []);

    if (loadError?.status === 403) {
        return (
            <div className="memory-status-message memory-status-message-error" role="alert">
                <FiAlertCircle aria-hidden="true"/>
                {NO_ADMIN_ACCESS_MESSAGE}
            </div>
        );
    }

    const reflection = status?.reflection ?? {};
    const embedding = status?.embedding ?? {};
    const injection = status?.injection ?? {};
    const users = status?.users ?? [];
    const asOf = status?.asOf ? new Date(status.asOf) : null;

    return (
        <div className="memory-status">
            <div className="memory-status-toolbar">
                <span className="memory-status-as-of">
                    {asOf ? `As of ${asOf.toLocaleString()}` : ""}
                </span>
                <button type="button" className="memory-button" onClick={() => void loadStatus()} disabled={refreshing}>
                    <FiRefreshCw aria-hidden="true"/> Refresh
                </button>
            </div>

            {loadError && (
                <div className="memory-status-message memory-status-message-error" role="alert">
                    <FiAlertCircle aria-hidden="true"/>
                    {LOAD_FAILED_MESSAGE}
                </div>
            )}

            {status && (
                <>
                    {reflection.enabled === false && (
                        <div className="memory-status-message memory-status-message-warning" role="status">
                            <FiAlertTriangle aria-hidden="true"/>
                            {REFLECTION_DISABLED_WARNING}
                        </div>
                    )}

                    {embedding.stale > 0 && (
                        <div className="memory-status-message memory-status-message-warning" role="status">
                            <FiAlertTriangle aria-hidden="true"/>
                            {`${embedding.stale} memories can't be found by relevance search until they're embedded.`}
                        </div>
                    )}

                    <div className="memory-status-cards">
                        <StatCard title="Reflection" headerExtra={<EnabledPill enabled={reflection.enabled}/>}>
                            <Stat label="Awaiting reflection" value={String(reflection.awaitingReflection ?? 0)}/>
                            <Stat label="Unseeded" value={String(reflection.unseededChats ?? 0)}/>
                            <Stat label="Completed last hour" value={completedLastHourLabel(reflection)}/>
                            <Stat
                                label="Last completed"
                                value={formatRelativeTimestamp(reflection.lastCompleted) ?? "Never"}
                            />
                            {Object.values(REFLECTION_STATUSES).map((reflectionStatus) => (
                                <Stat
                                    key={reflectionStatus}
                                    label={REFLECTION_STATUS_LABELS[reflectionStatus]}
                                    value={countOf(reflection.chatsByStatus, reflectionStatus)}
                                />
                            ))}
                            <Stat label="Model" value={reflection.model ?? "—"}/>
                            <Stat label="Schedule" value={reflection.cron ?? "—"}/>
                            <Stat label="Batch size" value={String(reflection.batchSize ?? "—")}/>
                            <Stat label="Idle minutes" value={String(reflection.idleMinutes ?? "—")}/>
                            <Stat label="Max attempts" value={String(reflection.maxAttempts ?? "—")}/>
                        </StatCard>

                        <StatCard title="Embedding">
                            <Stat label="Embedded" value={String(embedding.embedded ?? 0)}/>
                            <Stat label="Stale" value={String(embedding.stale ?? 0)}/>
                            <Stat label="Model" value={embedding.model ?? "—"}/>
                            <Stat label="Schedule" value={embedding.cron ?? "—"}/>
                            <Stat label="Batch size" value={String(embedding.batchSize ?? "—")}/>
                        </StatCard>

                        <StatCard title="Injection" headerExtra={<EnabledPill enabled={injection.enabled}/>}>
                            <Stat
                                label="Retrieval mode"
                                value={injection.retrievalMode
                                    ? `${injection.retrievalMode}: ${RETRIEVAL_MODE_DESCRIPTIONS[injection.retrievalMode] ?? ""}`
                                    : "—"}
                            />
                        </StatCard>

                        <StatCard title="Memories">
                            {Object.values(MEMORY_STATUSES).map((memoryStatus) => (
                                <Stat
                                    key={memoryStatus}
                                    label={STATUS_LABELS[memoryStatus]}
                                    value={countOf(status.memoriesByStatus, memoryStatus)}
                                />
                            ))}
                        </StatCard>
                    </div>

                    <h3 className="memory-status-users-title">Users</h3>

                    {users.length === 0 ? (
                        <p className="memory-empty-hint">No users have memories yet.</p>
                    ) : (
                        <div className="memory-status-table-wrapper">
                            <table className="memory-status-users">
                                <thead>
                                    <tr>
                                        <th scope="col">User</th>
                                        <th scope="col">Active</th>
                                        <th scope="col">Pending</th>
                                        <th scope="col">Superseded</th>
                                        <th scope="col">Pending chats</th>
                                        <th scope="col">In progress</th>
                                        <th scope="col">Completed</th>
                                        <th scope="col">Failed</th>
                                        <th scope="col">Last reflected</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user) => (
                                        <tr key={user.userId} className="memory-status-user-row">
                                            <td>
                                                <Link
                                                    to={`/settings/memory/all?userId=${encodeURIComponent(user.userId)}`}
                                                    title={user.userId}
                                                >
                                                    {shortId(user.userId)}
                                                </Link>
                                            </td>
                                            <td>{user.activeMemories ?? 0}</td>
                                            <td>{user.pendingMemories ?? 0}</td>
                                            <td>{user.supersededMemories ?? 0}</td>
                                            <td>{user.pendingChats ?? 0}</td>
                                            <td>{user.inProgressChats ?? 0}</td>
                                            <td>{user.completedChats ?? 0}</td>
                                            <td>
                                                {user.failedChats > 0 ? (
                                                    <Link
                                                        className="memory-status-failed-link"
                                                        to={`/settings/memory/reflections?userId=${encodeURIComponent(user.userId)}&status=${REFLECTION_STATUSES.FAILED}`}
                                                    >
                                                        {user.failedChats}
                                                    </Link>
                                                ) : (
                                                    0
                                                )}
                                            </td>
                                            <td>{formatRelativeTimestamp(user.lastReflected) ?? "Never"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default MemoryStatus;
