import {useState} from "react";
import {Link} from "react-router";
import {FiEdit2, FiTrash2} from "react-icons/fi";

import MemoryEditor from "./MemoryEditor.jsx";
import DeleteMemoryDialog from "./DeleteMemoryDialog.jsx";
import {
    formatConfidence,
    formatRelativeTimestamp,
    KIND_LABELS,
    MEMORY_ORIGINS,
    MEMORY_STATUSES,
    originLabel,
    PENDING_HINT,
    shortId,
    STATUS_LABELS,
    userLabel,
} from "./memoryLabels.js";
import "./MemoryRow.css";

const badgeModifier = (value) => (value ?? "").toLowerCase();

function MemoryRow({
    memory,
    ownerUserId,
    isOwnMemory = true,
    showAdminColumns = false,
    onChanged,
    onDeleted,
    onGone,
    onFilterUser,
}) {
    const [editing, setEditing] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    const isPending = memory.status === MEMORY_STATUSES.PENDING;
    const isSuperseded = memory.status === MEMORY_STATUSES.SUPERSEDED;
    const canAct = !isSuperseded && (!showAdminColumns || Boolean(ownerUserId));
    const confidence = memory.origin === MEMORY_ORIGINS.INFERRED ? formatConfidence(memory.confidence) : null;
    const lastConfirmed = formatRelativeTimestamp(memory.lastConfirmed);
    const chatIds = memory.chatIds ?? [];

    const handleSaved = (updatedMemory) => {
        setEditing(false);
        onChanged(updatedMemory);
    };

    const handleGone = () => {
        setEditing(false);
        (onGone ?? onDeleted)(memory.id);
    };

    const handleDeleted = (memoryId) => {
        setShowDeleteDialog(false);
        onDeleted(memoryId);
    };

    if (editing) {
        return (
            <li className="memory-row memory-row-editing">
                <MemoryEditor
                    memory={memory}
                    ownerUserId={ownerUserId}
                    onBehalfOfUser={!isOwnMemory}
                    onSaved={handleSaved}
                    onCancel={() => setEditing(false)}
                    onGone={handleGone}
                />
            </li>
        );
    }

    return (
        <li className={`memory-row ${isSuperseded ? "memory-row-superseded" : ""}`}>
            <div className="memory-row-main">
                <p className="memory-row-content">{memory.content}</p>

                <div className="memory-row-badges">
                    <span className={`memory-badge memory-badge-origin-${badgeModifier(memory.origin)}`}>
                        {originLabel(memory.origin, isOwnMemory)}
                    </span>

                    {showAdminColumns ? (
                        <>
                            <span className="memory-badge">{KIND_LABELS[memory.kind] ?? memory.kind}</span>
                            <span className={`memory-badge memory-badge-status-${badgeModifier(memory.status)}`}>
                                {STATUS_LABELS[memory.status] ?? memory.status}
                            </span>
                        </>
                    ) : (
                        isPending && (
                            <span className="memory-badge memory-badge-pending">
                                {STATUS_LABELS[MEMORY_STATUSES.PENDING]}
                            </span>
                        )
                    )}
                </div>
            </div>

            {isPending && <p className="memory-row-hint">{PENDING_HINT}</p>}

            <div className="memory-row-meta">
                {confidence && <span className="memory-row-confidence">{confidence} confidence</span>}

                {lastConfirmed && <span>Last confirmed {lastConfirmed}</span>}

                {chatIds.length > 0 && (
                    <span className="memory-row-provenance">
                        <span>Learned from {chatIds.length} {chatIds.length === 1 ? "conversation" : "conversations"}</span>
                        {chatIds.map((chatId) => (
                            isOwnMemory ? (
                                <Link key={chatId} to={`/chat/${encodeURIComponent(chatId)}`} className="memory-row-chat-link" title={chatId}>
                                    {shortId(chatId)}
                                </Link>
                            ) : (
                                <span key={chatId} className="memory-row-chat-id" title={chatId}>
                                    {shortId(chatId)}
                                </span>
                            )
                        ))}
                    </span>
                )}
            </div>

            {showAdminColumns && (
                <div className="memory-row-admin">
                    <span>
                        User{" "}
                        <button
                            type="button"
                            className="memory-link-button memory-row-user"
                            title={memory.userId}
                            onClick={() => onFilterUser?.(memory.userId)}
                        >
                            {userLabel(memory.username, memory.userId)}
                        </button>
                    </span>

                    <span>
                        Key <code className="memory-row-key">{memory.memoryKey ?? "—"}</code>
                    </span>

                    {memory.supersedes && (
                        <span className="memory-row-supersedes">
                            Supersedes{" "}
                            <button
                                type="button"
                                className="memory-link-button"
                                title={memory.supersedes}
                                onClick={() => onFilterUser?.(memory.userId)}
                            >
                                {shortId(memory.supersedes)}…
                            </button>
                        </span>
                    )}
                </div>
            )}

            {canAct && (
                <div className="memory-row-actions">
                    <button type="button" className="memory-row-action" onClick={() => setEditing(true)}>
                        <FiEdit2 aria-hidden="true"/>
                        Edit
                    </button>

                    <button
                        type="button"
                        className="memory-row-action memory-row-action-delete"
                        onClick={() => setShowDeleteDialog(true)}
                    >
                        <FiTrash2 aria-hidden="true"/>
                        Delete
                    </button>
                </div>
            )}

            {showDeleteDialog && (
                <DeleteMemoryDialog
                    memoryId={memory.id}
                    userId={ownerUserId}
                    content={memory.content}
                    onCancel={() => setShowDeleteDialog(false)}
                    onDeleted={handleDeleted}
                />
            )}
        </li>
    );
}

export default MemoryRow;
