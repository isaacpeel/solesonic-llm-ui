import {useCallback, useEffect, useRef, useState} from "react";
import {Link, useLocation, useNavigate, useParams} from "react-router";
import {toast} from "react-toastify";
import log from "loglevel";

import interestService, {
    AGENT_CADENCES,
    AGENT_LIMIT_REACHED_CODE,
    DEFAULT_CADENCE,
    NOT_PERMITTED_CODE,
    OFFER_ALREADY_DECIDED_CODE,
    OFFER_EXPIRED_CODE,
    OFFER_NOT_FOUND_CODE,
    OFFER_STATUSES,
    OFFER_WITHDRAWN_CODE,
} from "../service/InterestService.js";
import "./InterestOfferScreen.css";

const VIEWS = {
    LOADING: "loading",
    LOAD_FAILED: "loadFailed",
    NOT_FOUND: "notFound",
    ...OFFER_STATUSES,
};

const CLOSED_MESSAGES = {
    [VIEWS.DECLINED]: "You turned this suggestion down.",
    [VIEWS.EXPIRED]: "This suggestion has expired.",
    [VIEWS.WITHDRAWN]: "This suggestion was withdrawn because the memories behind it were removed.",
    [VIEWS.NOT_FOUND]: "This suggestion is no longer available.",
};

const REFETCH_FALLBACK_VIEWS = {
    [OFFER_WITHDRAWN_CODE]: VIEWS.WITHDRAWN,
    [OFFER_EXPIRED_CODE]: VIEWS.EXPIRED,
    [OFFER_ALREADY_DECIDED_CODE]: VIEWS.NOT_FOUND,
};

const AGENT_LIMIT_MESSAGE = "You're already following as many interests as you can.";
const NOT_PERMITTED_MESSAGE = "Your account can't use news agents.";
const ENABLE_FAILED_MESSAGE = "Couldn't turn this on. Please try again.";
const DECLINE_FAILED_MESSAGE = "Couldn't dismiss this suggestion. Please try again.";

const isNotFound = (caughtError) => caughtError?.status === 404 || caughtError?.code === OFFER_NOT_FOUND_CODE;

const hasExpired = (offer) => {
    const expiresMilliseconds = Date.parse(offer.expires);

    return Number.isFinite(expiresMilliseconds) && expiresMilliseconds <= Date.now();
};

const viewForOffer = (offer) => {
    if (offer?.status === OFFER_STATUSES.PENDING) {
        return hasExpired(offer) ? VIEWS.EXPIRED : VIEWS.PENDING;
    }

    if (Object.values(OFFER_STATUSES).includes(offer?.status)) {
        return offer.status;
    }

    return VIEWS.NOT_FOUND;
};

const InterestOfferView = ({offerId}) => {
    const location = useLocation();
    const navigate = useNavigate();

    const [acceptIntent] = useState(() => new URLSearchParams(location.search).get("intent") === "accept");
    const [offer, setOffer] = useState(null);
    const [view, setView] = useState(VIEWS.LOADING);
    const [cadence, setCadence] = useState(DEFAULT_CADENCE);
    const [submitting, setSubmitting] = useState(false);
    const [actionError, setActionError] = useState(null);

    const submittingRef = useRef(false);
    const loadGenerationRef = useRef(0);
    const enableButtonRef = useRef(null);

    useEffect(() => {
        if (location.search) {
            navigate(location.pathname, {replace: true});
        }
    }, [location.pathname, location.search, navigate]);

    const loadOffer = useCallback(async (fallbackView = null) => {
        loadGenerationRef.current += 1;
        const generation = loadGenerationRef.current;

        try {
            const loadedOffer = await interestService.getOffer(offerId);

            if (generation !== loadGenerationRef.current) {
                return;
            }

            const loadedView = viewForOffer(loadedOffer);

            setOffer(loadedOffer);
            setView(fallbackView && loadedView === VIEWS.PENDING ? fallbackView : loadedView);
        } catch (caughtError) {
            if (generation !== loadGenerationRef.current) {
                return;
            }

            if (isNotFound(caughtError)) {
                setView(VIEWS.NOT_FOUND);
                return;
            }

            log.error('[InterestOfferScreen] Failed to load the offer', offerId, caughtError);
            setView(fallbackView ?? VIEWS.LOAD_FAILED);
        }
    }, [offerId]);

    useEffect(() => {
        void loadOffer();
    }, [loadOffer]);

    useEffect(() => {
        return () => {
            loadGenerationRef.current += 1;
        };
    }, []);

    useEffect(() => {
        if (acceptIntent && view === VIEWS.PENDING) {
            enableButtonRef.current?.focus();
        }
    }, [acceptIntent, view]);

    const handleRefusal = async (caughtError, failureMessage) => {
        const fallbackView = REFETCH_FALLBACK_VIEWS[caughtError?.code];

        if (fallbackView) {
            await loadOffer(fallbackView);
            return;
        }

        if (isNotFound(caughtError)) {
            setView(VIEWS.NOT_FOUND);
            return;
        }

        if (caughtError?.code === AGENT_LIMIT_REACHED_CODE) {
            setActionError({message: AGENT_LIMIT_MESSAGE, linkToInterests: true});
            return;
        }

        if (caughtError?.code === NOT_PERMITTED_CODE) {
            setActionError({message: NOT_PERMITTED_MESSAGE, linkToInterests: false});
            return;
        }

        log.error('[InterestOfferScreen] Offer action failed', offerId, caughtError);
        setActionError({message: failureMessage, linkToInterests: false});
    };

    const runAction = async (action, failureMessage) => {
        if (submittingRef.current) {
            return;
        }

        submittingRef.current = true;
        setSubmitting(true);
        setActionError(null);

        try {
            await action();
        } catch (caughtError) {
            await handleRefusal(caughtError, failureMessage);
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    };

    const handleEnable = () => runAction(async () => {
        await interestService.acceptOffer(offerId, cadence);
        toast.success(`You'll get news about ${offer.label}. The first update is on its way.`);
        navigate("/settings/interests");
    }, ENABLE_FAILED_MESSAGE);

    const handleDecline = () => runAction(async () => {
        await interestService.declineOffer(offerId);
        toast("Okay — I won't suggest this again for a while.");
        navigate("/");
    }, DECLINE_FAILED_MESSAGE);

    const handleRetry = () => {
        setView(VIEWS.LOADING);
        void loadOffer();
    };

    const renderPendingOffer = () => (
        <>
            <h1 className="interest-offer-title">Get news about <strong>{offer.label}</strong>?</h1>

            {offer.rationale && (
                <p className="interest-offer-rationale">Suggested because {offer.rationale}</p>
            )}

            <div className="interest-offer-cadence" role="radiogroup" aria-label="How often">
                {AGENT_CADENCES.map(({value, label}) => (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={cadence === value}
                        className={cadence === value
                            ? "interest-offer-cadence-option interest-offer-cadence-option-selected"
                            : "interest-offer-cadence-option"}
                        disabled={submitting}
                        onClick={() => setCadence(value)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {actionError && (
                <p className="interest-offer-error" role="alert">
                    {actionError.message}
                    {actionError.linkToInterests && (
                        <> <Link to="/settings/interests">Manage your interests</Link></>
                    )}
                </p>
            )}

            <div className="interest-offer-actions">
                <button
                    ref={enableButtonRef}
                    type="button"
                    className="interest-offer-button interest-offer-button-primary interest-offer-enable"
                    disabled={submitting}
                    onClick={() => void handleEnable()}
                >
                    Enable
                </button>
                <button
                    type="button"
                    className="interest-offer-button interest-offer-decline"
                    disabled={submitting}
                    onClick={() => void handleDecline()}
                >
                    Not now
                </button>
            </div>

            <Link className="interest-offer-why" to="/settings/memory">
                Why am I seeing this? → Memory settings
            </Link>
        </>
    );

    const renderBody = () => {
        switch (view) {
            case VIEWS.LOADING:
                return (
                    <div className="interest-offer-skeleton" role="status" aria-label="Loading suggestion">
                        <div className="interest-offer-skeleton-line interest-offer-skeleton-line-wide"/>
                        <div className="interest-offer-skeleton-line"/>
                        <div className="interest-offer-skeleton-line interest-offer-skeleton-line-short"/>
                    </div>
                );
            case VIEWS.LOAD_FAILED:
                return (
                    <>
                        <p className="interest-offer-message">Couldn&apos;t load this suggestion.</p>
                        <div className="interest-offer-actions">
                            <button type="button" className="interest-offer-button" onClick={handleRetry}>
                                Retry
                            </button>
                        </div>
                    </>
                );
            case VIEWS.PENDING:
                return renderPendingOffer();
            case VIEWS.ACCEPTED:
                return (
                    <>
                        <h1 className="interest-offer-title">You&apos;re following {offer.label}.</h1>
                        <Link className="interest-offer-manage" to="/settings/interests">
                            Manage in Settings → Interests
                        </Link>
                    </>
                );
            default:
                return (
                    <>
                        <p className="interest-offer-message interest-offer-closed">{CLOSED_MESSAGES[view]}</p>
                        <Link className="interest-offer-back" to="/">Back to chat</Link>
                    </>
                );
        }
    };

    return (
        <div className="interest-offer-screen">
            <div className="interest-offer-card">
                {renderBody()}
            </div>
        </div>
    );
};

const InterestOfferScreen = () => {
    const {offerId} = useParams();

    return <InterestOfferView key={offerId} offerId={offerId}/>;
};

export default InterestOfferScreen;
