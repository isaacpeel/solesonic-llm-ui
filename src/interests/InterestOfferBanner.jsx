import {useCallback, useEffect, useRef, useState} from "react";
import {Link} from "react-router";
import {XMarkIcon} from "@heroicons/react/20/solid";
import log from "loglevel";

import interestService from "../service/InterestService.js";
import "./InterestOfferBanner.css";

const DISMISSED_KEY_PREFIX = "interest.offer.dismissed.";
const RECHECK_AFTER_MILLISECONDS = 5 * 60 * 1000;

const readDismissed = (offerId) => {
    try {
        return sessionStorage.getItem(`${DISMISSED_KEY_PREFIX}${offerId}`) === "true";
    } catch (storageError) {
        log.warn('[InterestOfferBanner] Dismissed offers are unreadable', storageError);
        return false;
    }
};

const writeDismissed = (offerId) => {
    try {
        sessionStorage.setItem(`${DISMISSED_KEY_PREFIX}${offerId}`, "true");
    } catch (storageError) {
        log.warn('[InterestOfferBanner] Could not remember a dismissed offer', storageError);
    }
};

const InterestOfferBanner = ({showing}) => {
    const [offer, setOffer] = useState(null);

    const lastCheckedRef = useRef(0);
    const checkGenerationRef = useRef(0);
    const dismissedOfferIdsRef = useRef(new Set());

    const isDismissed = useCallback((offerId) => {
        return dismissedOfferIdsRef.current.has(offerId) || readDismissed(offerId);
    }, []);

    const checkForOffer = useCallback(async () => {
        checkGenerationRef.current += 1;
        const generation = checkGenerationRef.current;

        lastCheckedRef.current = Date.now();

        try {
            const pendingOffers = await interestService.getPendingOffers();

            if (generation !== checkGenerationRef.current) {
                return;
            }

            const visibleOffer = (Array.isArray(pendingOffers) ? pendingOffers : [])
                .find((pendingOffer) => pendingOffer?.id && !isDismissed(pendingOffer.id));

            setOffer(visibleOffer ?? null);
        } catch (caughtError) {
            log.warn('[InterestOfferBanner] Could not check for interest offers', caughtError);
        }
    }, [isDismissed]);

    useEffect(() => {
        if (!showing) {
            return;
        }

        void checkForOffer();

        const handleVisibilityChange = () => {
            if (document.visibilityState !== "visible") {
                return;
            }

            if (Date.now() - lastCheckedRef.current >= RECHECK_AFTER_MILLISECONDS) {
                void checkForOffer();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            checkGenerationRef.current += 1;
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [showing, checkForOffer]);

    const handleDismiss = () => {
        dismissedOfferIdsRef.current.add(offer.id);
        writeDismissed(offer.id);
        setOffer(null);
    };

    if (!showing || !offer) {
        return null;
    }

    return (
        <div className="interest-offer-banner" role="status">
            <span className="interest-offer-banner-text">
                I can keep you posted on <strong>{offer.label}</strong>
            </span>
            <Link className="interest-offer-banner-review" to={`/interests/offers/${encodeURIComponent(offer.id)}`}>
                Review
            </Link>
            <button
                type="button"
                className="interest-offer-banner-dismiss"
                aria-label="Dismiss suggestion"
                title="Dismiss suggestion"
                onClick={handleDismiss}
            >
                <XMarkIcon aria-hidden="true"/>
            </button>
        </div>
    );
};

export default InterestOfferBanner;
