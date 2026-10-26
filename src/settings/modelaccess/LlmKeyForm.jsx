import {useId, useState} from "react";
import log from "loglevel";

import llmKeyService, {
    INVALID_LLM_KEY_CODE,
    LLM_KEY_VALIDATION_UNAVAILABLE_CODE,
} from "../../service/LlmKeyService.js";
import "./LlmKeyForm.css";

const MINIMUM_KEY_LENGTH = 12;
const WHITESPACE_PATTERN = /\s/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INVALID_KEY_FALLBACK_MESSAGE = "The model server did not accept this key.";
const VALIDATION_UNAVAILABLE_MESSAGE = "Couldn't reach the model server to check this key. Try again.";
const SAVE_FAILED_MESSAGE = "Could not save the key. Please try again.";

const describeSaveError = (caughtError, apiKey) => {
    if (caughtError?.code === INVALID_LLM_KEY_CODE) {
        const serverMessage = caughtError.serverMessage;

        if (!serverMessage || serverMessage.includes(apiKey)) {
            return INVALID_KEY_FALLBACK_MESSAGE;
        }

        return serverMessage;
    }

    if (caughtError?.code === LLM_KEY_VALIDATION_UNAVAILABLE_CODE || caughtError?.status >= 500) {
        return VALIDATION_UNAVAILABLE_MESSAGE;
    }

    return SAVE_FAILED_MESSAGE;
};

const LlmKeyForm = ({fixedUserId, onCancel, onSaved, onForbidden}) => {
    const [userIdInput, setUserIdInput] = useState(fixedUserId ?? "");
    const [apiKey, setApiKey] = useState("");
    const [keyVisible, setKeyVisible] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);

    const userIdFieldId = useId();
    const keyFieldId = useId();
    const errorId = useId();

    const replacing = Boolean(fixedUserId);
    const targetUserId = replacing ? fixedUserId : userIdInput.trim();
    const keyWellFormed = apiKey.length >= MINIMUM_KEY_LENGTH && !WHITESPACE_PATTERN.test(apiKey);
    const userIdWellFormed = replacing || UUID_PATTERN.test(targetUserId);
    const canSave = keyWellFormed && userIdWellFormed && !saving;

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!canSave) {
            return;
        }

        setSaving(true);
        setSaveError(null);
        setKeyVisible(false);

        try {
            const savedSummary = await llmKeyService.registerKey(targetUserId, apiKey);
            setApiKey("");
            onSaved(savedSummary, {replaced: replacing});
        } catch (caughtError) {
            setSaving(false);

            if (caughtError?.status === 403) {
                setApiKey("");
                onForbidden();
                return;
            }

            log.error('[LlmKeyForm] Saving the model key failed', caughtError?.status, caughtError?.code);
            setSaveError(describeSaveError(caughtError, apiKey));
        }
    };

    return (
        <form className="llm-key-form" onSubmit={handleSubmit}>
            <h3 className="llm-key-form-title">{replacing ? "Replace key" : "Give access"}</h3>

            <div className="llm-key-form-field">
                <label htmlFor={userIdFieldId}>User ID</label>
                <input
                    id={userIdFieldId}
                    type="text"
                    className="llm-key-form-input llm-key-form-input-mono"
                    value={userIdInput}
                    readOnly={replacing}
                    autoFocus={!replacing}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setUserIdInput(event.target.value)}
                />
                {!replacing && (
                    <p className="llm-key-form-hint">
                        The user&apos;s id from Keycloak, or from Settings → Memory → All Memories.
                    </p>
                )}
            </div>

            <div className="llm-key-form-field">
                <label htmlFor={keyFieldId}>API key</label>
                <div className="llm-key-form-key-row">
                    <input
                        id={keyFieldId}
                        type={keyVisible ? "text" : "password"}
                        className="llm-key-form-input llm-key-form-input-mono"
                        value={apiKey}
                        autoComplete="new-password"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        data-form-type="other"
                        spellCheck={false}
                        aria-invalid={saveError ? true : undefined}
                        aria-describedby={saveError ? errorId : undefined}
                        autoFocus={replacing}
                        onChange={(event) => setApiKey(event.target.value.trim())}
                    />
                    <button
                        type="button"
                        className="llm-key-form-button"
                        onClick={() => setKeyVisible((visible) => !visible)}
                    >
                        {keyVisible ? "Hide key" : "Show key"}
                    </button>
                </div>
                {saveError && (
                    <p id={errorId} className="llm-key-form-error" role="alert">{saveError}</p>
                )}
            </div>

            <div className="llm-key-form-actions">
                <button type="button" className="llm-key-form-button" disabled={saving} onClick={onCancel}>
                    Cancel
                </button>
                <button type="submit" className="llm-key-form-button llm-key-form-button-primary" disabled={!canSave}>
                    {saving ? "Saving…" : "Save"}
                </button>
            </div>
        </form>
    );
};

export default LlmKeyForm;
