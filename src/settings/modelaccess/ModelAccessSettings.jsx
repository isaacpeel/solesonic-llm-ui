import {useState} from "react";
import {Navigate} from "react-router";
import {toast} from "react-toastify";
import {FiAlertCircle} from "react-icons/fi";

import RoleGuard from "../../authorizer/RoleGuard.jsx";
import {ROLES} from "../../authorizer/roles.js";
import {useKeycloak} from "../../providers/KeycloakProvider.jsx";
import usePagedList from "../../hooks/usePagedList.js";
import llmKeyService from "../../service/LlmKeyService.js";
import LlmKeyRow from "./LlmKeyRow.jsx";
import LlmKeyForm from "./LlmKeyForm.jsx";
import RemoveLlmKeyDialog from "./RemoveLlmKeyDialog.jsx";
import "./ModelAccessSettings.css";

const NO_PERMISSION_MESSAGE = "You no longer have permission to manage model access.";
const LOAD_FAILED_MESSAGE = "Could not load model access.";
const ALREADY_REMOVED_MESSAGE = "Already removed";

const summaryKey = (summary) => summary.userId;

const fetchKeyPage = (page) => llmKeyService.findKeys(page);

const withoutUser = (summaries, userId) => summaries.filter((summary) => summary.userId !== userId);

const ModelAccessPanel = () => {
    const {keycloak} = useKeycloak();
    const currentUserId = keycloak?.tokenParsed?.sub ?? null;

    const [formRequest, setFormRequest] = useState(null);
    const [removeTarget, setRemoveTarget] = useState(null);

    const {items, setItems, loaded, hasMore, loadingMore, loadError, sentinelRef, reload} = usePagedList(
        fetchKeyPage,
        "llm-keys",
        summaryKey,
    );

    const formOpen = formRequest !== null;

    const handleSaved = (savedSummary, {replaced}) => {
        setItems((currentSummaries) => {
            const alreadyListed = currentSummaries.some((summary) => summary.userId === savedSummary.userId);

            if (replaced && alreadyListed) {
                return currentSummaries.map((summary) => (
                    summary.userId === savedSummary.userId ? {...summary, ...savedSummary} : summary
                ));
            }

            return [savedSummary, ...withoutUser(currentSummaries, savedSummary.userId)];
        });

        setFormRequest(null);
    };

    const handleForbidden = () => {
        setFormRequest(null);
        toast.error(NO_PERMISSION_MESSAGE);
    };

    const handleRemoved = (removedUserId, {alreadyRemoved}) => {
        setItems((currentSummaries) => withoutUser(currentSummaries, removedUserId));
        setRemoveTarget(null);

        if (alreadyRemoved) {
            toast(ALREADY_REMOVED_MESSAGE);
        }
    };

    if (loadError?.status === 403) {
        return (
            <div className="model-access-settings">
                <h2>Model Access</h2>
                <div className="model-access-message model-access-message-error" role="alert">
                    <FiAlertCircle aria-hidden="true"/>
                    {NO_PERMISSION_MESSAGE}
                </div>
            </div>
        );
    }

    return (
        <div className="model-access-settings">
            <h2 tabIndex={-1}>Model Access</h2>
            <p className="settings-content-subtitle">
                Keys are created in LiteLLM and pasted here. A user without one cannot chat.
            </p>

            <div className="model-access-toolbar">
                <button
                    type="button"
                    className="model-access-button model-access-button-primary"
                    disabled={formOpen || !loaded}
                    onClick={() => setFormRequest({userId: null})}
                >
                    Give access
                </button>
            </div>

            {formRequest && (
                <LlmKeyForm
                    key={formRequest.userId ?? "grant"}
                    fixedUserId={formRequest.userId}
                    onCancel={() => setFormRequest(null)}
                    onSaved={handleSaved}
                    onForbidden={handleForbidden}
                />
            )}

            {loadError && (
                <div className="model-access-message model-access-message-error" role="alert">
                    <FiAlertCircle aria-hidden="true"/>
                    {LOAD_FAILED_MESSAGE}
                    <button type="button" className="model-access-button" onClick={reload}>Retry</button>
                </div>
            )}

            {items.length > 0 && (
                <>
                    <ul className="llm-key-list">
                        {items.map((summary) => (
                            <LlmKeyRow
                                key={summary.userId}
                                summary={summary}
                                currentUserId={currentUserId}
                                actionsDisabled={formOpen}
                                onReplace={() => setFormRequest({userId: summary.userId})}
                                onRemove={() => setRemoveTarget(summary)}
                            />
                        ))}
                    </ul>

                    {hasMore && <div ref={sentinelRef} className="model-access-sentinel" aria-hidden="true"/>}

                    <div className="model-access-loading-more" role="status" aria-live="polite">
                        {loadingMore ? "Loading more…" : ""}
                    </div>
                </>
            )}

            {loaded && items.length === 0 && !loadError && (
                <p className="model-access-empty">No one has model access yet.</p>
            )}

            {removeTarget && (
                <RemoveLlmKeyDialog
                    summary={removeTarget}
                    onCancel={() => setRemoveTarget(null)}
                    onRemoved={handleRemoved}
                />
            )}
        </div>
    );
};

const ModelAccessSettings = () => (
    <RoleGuard role={ROLES.LLM_KEY_ADMIN} fallback={<Navigate to="/settings/general" replace/>}>
        <ModelAccessPanel/>
    </RoleGuard>
);

export default ModelAccessSettings;
