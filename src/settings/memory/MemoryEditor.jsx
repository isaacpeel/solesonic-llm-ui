import {useState} from "react";
import log from "loglevel";

import memoryService from "../../service/MemoryService.js";
import {KIND_LABELS, KIND_SECTIONS, MEMORY_ORIGINS, SAVE_REJECTED_MESSAGE} from "./memoryLabels.js";
import "./MemoryEditor.css";

const OWNERSHIP_NOTE = "Editing makes this memory yours. Deleting the conversations it came from will no longer remove it.";
const ON_BEHALF_WARNING = "Saving converts this memory to one the user authored, on their behalf. The change is logged.";
const SAVE_FAILED_MESSAGE = "Could not save the memory. Please try again.";

const changedFields = (memory, content, kind) => {
    const changes = {};

    if (content !== memory.content) {
        changes.content = content;
    }

    if (kind !== memory.kind) {
        changes.kind = kind;
    }

    return changes;
};

function MemoryEditor({memory, ownerUserId, onBehalfOfUser = false, onSaved, onCancel, onGone}) {
    const [content, setContent] = useState(memory.content ?? "");
    const [kind, setKind] = useState(memory.kind ?? "");
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);

    const contentId = `memory-editor-content-${memory.id}`;
    const kindId = `memory-editor-kind-${memory.id}`;
    const showOwnershipNote = !onBehalfOfUser && memory.origin !== MEMORY_ORIGINS.AUTHORED;

    const handleSubmit = async (event) => {
        event.preventDefault();

        const trimmedContent = content.trim();

        if (!trimmedContent) {
            setSaveError(SAVE_REJECTED_MESSAGE);
            return;
        }

        const changes = changedFields(memory, trimmedContent, kind);

        if (Object.keys(changes).length === 0) {
            onCancel();
            return;
        }

        setSaving(true);
        setSaveError(null);

        try {
            const updatedMemory = await memoryService.updateMemory(memory.id, changes, ownerUserId);
            onSaved(updatedMemory);
        } catch (caughtError) {
            setSaving(false);

            if (caughtError.status === 404) {
                onGone();
                return;
            }

            if (caughtError.status === 400) {
                setSaveError(SAVE_REJECTED_MESSAGE);
                return;
            }

            log.error('[MemoryEditor] Save failed', memory.id, caughtError);
            setSaveError(SAVE_FAILED_MESSAGE);
        }
    };

    return (
        <form className="memory-editor" onSubmit={handleSubmit}>
            <label className="memory-editor-label" htmlFor={contentId}>Memory content</label>
            <textarea
                id={contentId}
                className="memory-editor-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                disabled={saving}
                rows={3}
                autoFocus
            />

            <label className="memory-editor-label" htmlFor={kindId}>Memory kind</label>
            <select
                id={kindId}
                className="memory-editor-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
                disabled={saving}
            >
                {KIND_SECTIONS.map((section) => (
                    <option key={section.kind} value={section.kind}>{KIND_LABELS[section.kind]}</option>
                ))}
            </select>

            {showOwnershipNote && <p className="memory-editor-note">{OWNERSHIP_NOTE}</p>}

            {onBehalfOfUser && <p className="memory-editor-warning">{ON_BEHALF_WARNING}</p>}

            {saveError && <p className="memory-editor-error" role="alert">{saveError}</p>}

            <div className="memory-editor-actions">
                <button type="button" className="memory-button" onClick={onCancel} disabled={saving}>
                    Cancel
                </button>

                <button type="submit" className="memory-button memory-editor-save" disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                </button>
            </div>
        </form>
    );
}

export default MemoryEditor;
