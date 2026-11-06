import {useCallback, useEffect, useRef, useState} from "react";
import {Link} from "react-router";
import {toast} from "react-toastify";
import log from "loglevel";

import interestService from "../../service/InterestService.js";
import InterestAgentCard from "./InterestAgentCard.jsx";
import DeleteInterestAgentDialog from "./DeleteInterestAgentDialog.jsx";
import "./InterestSettings.css";

const InterestSettings = () => {
    const [agents, setAgents] = useState(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [pendingOffer, setPendingOffer] = useState(null);
    const [deleteRequest, setDeleteRequest] = useState(null);

    const loadGenerationRef = useRef(0);

    const findPendingOffer = useCallback(async (generation) => {
        try {
            const pendingOffers = await interestService.getPendingOffers();

            if (generation === loadGenerationRef.current) {
                setPendingOffer(Array.isArray(pendingOffers) ? pendingOffers[0] ?? null : null);
            }
        } catch (caughtError) {
            log.warn('[InterestSettings] Could not check for a pending interest offer', caughtError);
        }
    }, []);

    const loadAgents = useCallback(async () => {
        loadGenerationRef.current += 1;
        const generation = loadGenerationRef.current;

        setLoadFailed(false);

        try {
            const loadedAgents = await interestService.getAgents();

            if (generation !== loadGenerationRef.current) {
                return;
            }

            const agentList = Array.isArray(loadedAgents) ? loadedAgents : [];

            setAgents(agentList);

            if (agentList.length === 0) {
                void findPendingOffer(generation);
            }
        } catch (caughtError) {
            if (generation !== loadGenerationRef.current) {
                return;
            }

            log.error('[InterestSettings] Failed to load interest agents', caughtError);
            setLoadFailed(true);
        }
    }, [findPendingOffer]);

    useEffect(() => {
        void loadAgents();
    }, [loadAgents]);

    useEffect(() => {
        return () => {
            loadGenerationRef.current += 1;
        };
    }, []);

    const replaceAgent = useCallback((updatedAgent) => {
        setAgents((currentAgents) => (currentAgents ?? []).map((agent) => (
            agent.id === updatedAgent.id ? {...agent, ...updatedAgent} : agent
        )));
    }, []);

    const handleDeleted = (deletedAgentId) => {
        const deletedLabel = deleteRequest?.label;

        setAgents((currentAgents) => (currentAgents ?? []).filter((agent) => agent.id !== deletedAgentId));
        setDeleteRequest(null);
        toast(`Stopped news about ${deletedLabel}.`);
    };

    const handleRetry = () => {
        setAgents(null);
        void loadAgents();
    };

    return (
        <div className="interest-settings">
            <h2>Interests</h2>
            <p className="settings-content-subtitle">
                News agents that keep you posted on things you follow. Each update arrives as a new chat.
            </p>

            {loadFailed && (
                <div className="interest-settings-error" role="alert">
                    <span>Could not load your interests.</span>
                    <button type="button" className="interest-settings-button" onClick={handleRetry}>
                        Retry
                    </button>
                </div>
            )}

            {!loadFailed && agents === null && (
                <div className="interest-settings-loading" role="status" aria-label="Loading interests"/>
            )}

            {!loadFailed && agents?.length === 0 && (
                <div className="interest-settings-empty">
                    <p>No interests yet. When I notice something you follow, I&apos;ll offer to keep you posted.</p>
                    {pendingOffer && (
                        <Link to={`/interests/offers/${encodeURIComponent(pendingOffer.id)}`}>
                            Review the suggestion about {pendingOffer.label}
                        </Link>
                    )}
                </div>
            )}

            {!loadFailed && agents?.length > 0 && (
                <ul className="interest-agent-list">
                    {agents.map((agent) => (
                        <li key={agent.id}>
                            <InterestAgentCard
                                agent={agent}
                                onAgentChanged={replaceAgent}
                                onReloadAgents={loadAgents}
                                onDeleteRequested={setDeleteRequest}
                            />
                        </li>
                    ))}
                </ul>
            )}

            {deleteRequest && (
                <DeleteInterestAgentDialog
                    agent={deleteRequest}
                    onCancel={() => setDeleteRequest(null)}
                    onDeleted={handleDeleted}
                />
            )}
        </div>
    );
};

export default InterestSettings;
