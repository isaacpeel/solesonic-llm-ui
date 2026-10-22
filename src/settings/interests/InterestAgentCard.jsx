import {useState} from "react";
import {Link} from "react-router";
import {toast} from "react-toastify";
import log from "loglevel";

import interestService, {
    AGENT_CADENCES,
    AGENT_NOT_FOUND_CODE,
    AGENT_STATUSES,
    INVALID_AGENT_UPDATE_CODE,
    RUN_TOO_SOON_CODE,
    hasApiErrorCode,
} from "../../service/InterestService.js";
import {formatRelativeTime, formatTimeUntil} from "../../util/relativeTime.js";
import describeSources from "../../interests/describeSources.js";
import "./InterestAgentCard.css";

const MAXIMUM_LABEL_LENGTH = 120;
const MAXIMUM_QUERY_LENGTH = 400;
const RECENT_UPDATES_PAGE_SIZE = 5;

const CHECK_NOW_MESSAGE = "I'll check for news within the next few minutes — you'll be notified if there's anything new.";
const RUN_TOO_SOON_MESSAGE = "Checked recently, try again in a few minutes.";
const AGENT_GONE_MESSAGE = "That interest no longer exists.";
const EDIT_REFUSED_MESSAGE = "Those changes couldn't be saved. Check the label and search query.";

const isAgentGone = (caughtError) => caughtError?.status === 404 || hasApiErrorCode(caughtError, AGENT_NOT_FOUND_CODE);

const isRefusedUpdate = (caughtError) => caughtError?.status === 400 || hasApiErrorCode(caughtError, INVALID_AGENT_UPDATE_CODE);

const isRunTooSoon = (caughtError) => caughtError?.status === 429 || hasApiErrorCode(caughtError, RUN_TOO_SOON_CODE);

const timeSince = (timestamp) => (timestamp ? formatRelativeTime(new Date(timestamp)) : null);

const describeUpdateDate = (timestamp) => {
    const date = new Date(timestamp);

    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, {dateStyle: "medium"});
};

const validateEdit = ({label, query}) => {
    const errors = {};

    if (label.length === 0) {
        errors.label = "Give this interest a label.";
    } else if (label.length > MAXIMUM_LABEL_LENGTH) {
        errors.label = `Keep the label to ${MAXIMUM_LABEL_LENGTH} characters or fewer.`;
    }

    if (query.length === 0) {
        errors.query = "Give this interest a search query.";
    } else if (query.length > MAXIMUM_QUERY_LENGTH) {
        errors.query = `Keep the search query to ${MAXIMUM_QUERY_LENGTH} characters or fewer.`;
    }

    return errors;
};

function InterestAgentCard({agent, onAgentChanged, onReloadAgents, onDeleteRequested}) {
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({label: "", query: ""});
    const [editErrors, setEditErrors] = useState({});
    const [editRefused, setEditRefused] = useState(false);
    const [updatesOpen, setUpdatesOpen] = useState(false);
    const [updates, setUpdates] = useState(null);
    const [updatesFailed, setUpdatesFailed] = useState(false);

    const isActive = agent.status === AGENT_STATUSES.ACTIVE;
    const cadenceSelectId = `interest-agent-cadence-${agent.id}`;
    const labelInputId = `interest-agent-label-${agent.id}`;
    const queryInputId = `interest-agent-query-${agent.id}`;

    const handleAgentGone = () => {
        toast.error(AGENT_GONE_MESSAGE);
        void onReloadAgents();
    };

    const applyChange = async (changes, handleRefused = null) => {
        setBusy(true);

        try {
            const updatedAgent = await interestService.updateAgent(agent.id, changes);
            onAgentChanged(updatedAgent ?? {...agent, ...changes});
            return true;
        } catch (caughtError) {
            if (isAgentGone(caughtError)) {
                handleAgentGone();
                return false;
            }

            if (handleRefused && isRefusedUpdate(caughtError)) {
                handleRefused();
                return false;
            }

            log.error('[InterestAgentCard] Failed to update an interest agent', agent.id, caughtError);
            toast.error("Couldn't update this interest. Please try again.");
            return false;
        } finally {
            setBusy(false);
        }
    };

    const handleToggleStatus = () => {
        void applyChange({status: isActive ? AGENT_STATUSES.PAUSED : AGENT_STATUSES.ACTIVE});
    };

    const handleCadenceChange = (event) => {
        void applyChange({cadence: event.target.value});
    };

    const handleEditStart = () => {
        setDraft({label: agent.label ?? "", query: agent.query ?? ""});
        setEditErrors({});
        setEditRefused(false);
        setEditing(true);
    };

    const handleSave = async (event) => {
        event.preventDefault();

        const label = draft.label.trim();
        const query = draft.query.trim();
        const errors = validateEdit({label, query});

        setEditErrors(errors);
        setEditRefused(false);

        if (Object.keys(errors).length > 0) {
            return;
        }

        if (label === agent.label && query === agent.query) {
            setEditing(false);
            return;
        }

        const saved = await applyChange({label, query}, () => setEditRefused(true));

        if (saved) {
            setEditing(false);
        }
    };

    const handleCheckNow = async () => {
        setBusy(true);

        try {
            const updatedAgent = await interestService.runAgent(agent.id);
            onAgentChanged(updatedAgent ?? agent);
            toast.success(CHECK_NOW_MESSAGE);
        } catch (caughtError) {
            if (isRunTooSoon(caughtError)) {
                toast.info(RUN_TOO_SOON_MESSAGE);
            } else if (isAgentGone(caughtError)) {
                handleAgentGone();
            } else if (isRefusedUpdate(caughtError)) {
                void onReloadAgents();
            } else {
                log.error('[InterestAgentCard] Failed to start a check', agent.id, caughtError);
                toast.error("Couldn't start a check. Please try again.");
            }
        } finally {
            setBusy(false);
        }
    };

    const handleToggleUpdates = async () => {
        if (updatesOpen) {
            setUpdatesOpen(false);
            return;
        }

        setUpdatesOpen(true);
        setUpdates(null);
        setUpdatesFailed(false);

        try {
            const page = await interestService.getAgentUpdates(agent.id, 0, RECENT_UPDATES_PAGE_SIZE);
            setUpdates(Array.isArray(page?.content) ? page.content : []);
        } catch (caughtError) {
            log.warn('[InterestAgentCard] Could not load recent updates', agent.id, caughtError);
            setUpdatesFailed(true);
        }
    };

    const renderFacts = () => {
        const lastFailure = timeSince(agent.lastFailureAt);
        const lastUpdate = timeSince(agent.lastUpdateAt);
        const nextCheck = agent.nextRunAt ? formatTimeUntil(new Date(agent.nextRunAt)) : null;

        return (
            <ul className="interest-agent-facts">
                {agent.failures > 0 && (
                    <li className="interest-agent-failure">
                        {lastFailure ? `Last check failed ${lastFailure}` : "Last check failed"}
                    </li>
                )}
                <li>{lastUpdate ? `Last update ${lastUpdate}` : "No news yet"}</li>
                {isActive && nextCheck && <li>{`Next check ${nextCheck}`}</li>}
            </ul>
        );
    };

    const renderEditor = () => (
        <form className="interest-agent-edit" onSubmit={(event) => void handleSave(event)} noValidate>
            <label className="interest-agent-field" htmlFor={labelInputId}>
                <span>Label</span>
                <input
                    id={labelInputId}
                    type="text"
                    value={draft.label}
                    maxLength={MAXIMUM_LABEL_LENGTH}
                    disabled={busy}
                    onChange={(event) => setDraft((currentDraft) => ({...currentDraft, label: event.target.value}))}
                />
            </label>
            <p className="interest-agent-hint">Past updates and the chat group keep their current name.</p>
            {editErrors.label && <p className="interest-agent-field-error">{editErrors.label}</p>}

            <label className="interest-agent-field" htmlFor={queryInputId}>
                <span>Search query</span>
                <textarea
                    id={queryInputId}
                    rows={2}
                    value={draft.query}
                    maxLength={MAXIMUM_QUERY_LENGTH}
                    disabled={busy}
                    onChange={(event) => setDraft((currentDraft) => ({...currentDraft, query: event.target.value}))}
                />
            </label>
            {editErrors.query && <p className="interest-agent-field-error">{editErrors.query}</p>}

            {editRefused && <p className="interest-agent-field-error" role="alert">{EDIT_REFUSED_MESSAGE}</p>}

            <div className="interest-agent-actions">
                <button type="submit" className="interest-agent-button interest-agent-button-primary" disabled={busy}>
                    Save
                </button>
                <button type="button" className="interest-agent-button" disabled={busy} onClick={() => setEditing(false)}>
                    Cancel
                </button>
            </div>
        </form>
    );

    const renderUpdates = () => {
        if (updatesFailed) {
            return <p className="interest-agent-updates-status">Couldn&apos;t load recent updates.</p>;
        }

        if (updates === null) {
            return <p className="interest-agent-updates-status">Loading…</p>;
        }

        if (updates.length === 0) {
            return <p className="interest-agent-updates-status">No updates yet.</p>;
        }

        return (
            <ul className="interest-agent-updates">
                {updates.map((update) => (
                    <li key={update.id} className="interest-agent-update">
                        <Link to={`/chat/${encodeURIComponent(update.chatId)}`}>
                            {`${describeUpdateDate(update.created)} · ${describeSources(update.itemCount)}`}
                        </Link>
                    </li>
                ))}
            </ul>
        );
    };

    return (
        <article className="interest-agent-card">
            <header className="interest-agent-header">
                <h3 className="interest-agent-label">{agent.label}</h3>
                <span className={`interest-agent-status interest-agent-status-${isActive ? "active" : "paused"}`}>
                    {isActive ? "Active" : "Paused"}
                </span>
            </header>

            <p className="interest-agent-query">{agent.query}</p>

            {renderFacts()}

            {editing ? renderEditor() : (
                <div className="interest-agent-controls">
                    <label className="interest-agent-cadence" htmlFor={cadenceSelectId}>
                        <span>Cadence</span>
                        <select id={cadenceSelectId} value={agent.cadence} disabled={busy} onChange={handleCadenceChange}>
                            {AGENT_CADENCES.map(({value, label}) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </label>

                    <div className="interest-agent-actions">
                        <button type="button" className="interest-agent-button" disabled={busy} onClick={handleToggleStatus}>
                            {isActive ? "Pause" : "Resume"}
                        </button>
                        {isActive && (
                            <button type="button" className="interest-agent-button" disabled={busy} onClick={() => void handleCheckNow()}>
                                Check now
                            </button>
                        )}
                        <button type="button" className="interest-agent-button" disabled={busy} onClick={handleEditStart}>
                            Edit
                        </button>
                        <button
                            type="button"
                            className="interest-agent-button"
                            aria-expanded={updatesOpen}
                            onClick={() => void handleToggleUpdates()}
                        >
                            Recent updates
                        </button>
                        <button
                            type="button"
                            className="interest-agent-button interest-agent-button-destructive"
                            disabled={busy}
                            onClick={() => onDeleteRequested(agent)}
                        >
                            Delete
                        </button>
                    </div>
                </div>
            )}

            {updatesOpen && renderUpdates()}
        </article>
    );
}

export default InterestAgentCard;
