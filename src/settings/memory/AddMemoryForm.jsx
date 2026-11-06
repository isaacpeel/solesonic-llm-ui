import {useState} from "react";
import log from "loglevel";

import memoryService from "../../service/MemoryService.js";
import {KIND_LABELS, KIND_SECTIONS, SAVE_REJECTED_MESSAGE} from "./memoryLabels.js";
import "./AddMemoryForm.css";

const ADD_FAILED_MESSAGE = "Could not add the memory. Please try again.";

function AddMemoryForm({onCreated}) {
    const [kind, setKind] = useState("");
    const [content, setContent] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);

    const trimmedContent = content.trim();
    const canSubmit = Boolean(kind) && Boolean(trimmedContent) && !saving;

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!canSubmit) {
            return;
        }

        setSaving(true);
        setSaveError(null);

        try {
            const createdMemory = await memoryService.createMemory({kind, content: trimmedContent});
            onCreated(createdMemory);
            setKind("");
            setContent("");
        } catch (caughtError) {
            if (caughtError.status === 400) {
                setSaveError(SAVE_REJECTED_MESSAGE);
            } else {
                log.error('[AddMemoryForm] Create failed', caughtError);
                setSaveError(ADD_FAILED_MESSAGE);
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className="add-memory-form" aria-label="Add a memory" onSubmit={handleSubmit}>
            <h3 className="add-memory-form-title">Add a memory</h3>

            <div className="add-memory-form-fields">
                <div className="add-memory-form-field">
                    <label htmlFor="add-memory-kind">Kind</label>
                    <select
                        id="add-memory-kind"
                        className="add-memory-form-kind"
                        value={kind}
                        onChange={(event) => setKind(event.target.value)}
                        disabled={saving}
                        required
                    >
                        <option value="" disabled>Choose a kind</option>
                        {KIND_SECTIONS.map((section) => (
                            <option key={section.kind} value={section.kind}>{KIND_LABELS[section.kind]}</option>
                        ))}
                    </select>
                </div>

                <div className="add-memory-form-field add-memory-form-field-wide">
                    <label htmlFor="add-memory-content">Memory</label>
                    <textarea
                        id="add-memory-content"
                        className="add-memory-form-content"
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        disabled={saving}
                        rows={2}
                        placeholder="Something the assistant should know or do"
                    />
                </div>
            </div>

            {saveError && <p className="add-memory-form-error" role="alert">{saveError}</p>}

            <div className="add-memory-form-actions">
                <button type="submit" className="memory-button" disabled={!canSubmit}>
                    {saving ? "Adding…" : "Add memory"}
                </button>
            </div>
        </form>
    );
}

export default AddMemoryForm;
