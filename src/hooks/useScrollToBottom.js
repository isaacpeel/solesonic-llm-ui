import {useCallback, useEffect, useRef, useState} from 'react';

/*
 * The transcript is never auto-scrolled, so a streaming answer runs off the bottom of the
 * viewport and the user has no idea how far behind they are. Report whether the transcript
 * is parked away from its end so the screen can offer a jump-to-bottom control.
 *
 * The scroller is resolved at measure time rather than assumed. `.chat-content` declares
 * overflow-y: auto, but nothing gives body/#root a height, so in practice the document is
 * what scrolls; the container only takes over if a layout change ever gives it a bounded
 * height. Whichever it is, listening on window catches both — scroll events from the
 * document arrive there, and container scrolls reach it during the capture phase.
 *
 * A scroll listener alone is not enough: while a reply streams, the content grows without
 * the user scrolling. Passing the streaming history as `contentDependency` re-measures
 * after every append, and a ResizeObserver covers height changes the render does not
 * account for (viewport resize, composer tray opening, images finishing their load).
 */
const BOTTOM_THRESHOLD_PIXELS = 48;

function useScrollToBottom(contentDependency) {
    const scrollContainerRef = useRef(null);
    const [isScrolledAwayFromBottom, setIsScrolledAwayFromBottom] = useState(false);

    const resolveScrollingElement = useCallback(() => {
        const scrollContainer = scrollContainerRef.current;

        if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight + 1) {
            return scrollContainer;
        }

        return document.scrollingElement || document.documentElement;
    }, []);

    const measureScrollPosition = useCallback(() => {
        const scrollingElement = resolveScrollingElement();

        if (!scrollingElement) {
            return;
        }

        const distanceFromBottom = scrollingElement.scrollHeight - scrollingElement.scrollTop - scrollingElement.clientHeight;
        setIsScrolledAwayFromBottom(distanceFromBottom > BOTTOM_THRESHOLD_PIXELS);
    }, [resolveScrollingElement]);

    useEffect(() => {
        measureScrollPosition();

        window.addEventListener('scroll', measureScrollPosition, {passive: true, capture: true});
        window.addEventListener('resize', measureScrollPosition);

        /* Absent in some test environments; the listeners above still carry the common cases. */
        const resizeObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(measureScrollPosition)
            : null;

        if (resizeObserver && scrollContainerRef.current) {
            resizeObserver.observe(scrollContainerRef.current);
        }

        return () => {
            window.removeEventListener('scroll', measureScrollPosition, {capture: true});
            window.removeEventListener('resize', measureScrollPosition);
            resizeObserver?.disconnect();
        };
    }, [measureScrollPosition]);

    useEffect(() => {
        measureScrollPosition();
    }, [measureScrollPosition, contentDependency]);

    const scrollToBottom = useCallback(() => {
        const scrollingElement = resolveScrollingElement();

        if (!scrollingElement) {
            return;
        }

        if (typeof scrollingElement.scrollTo === 'function') {
            scrollingElement.scrollTo({top: scrollingElement.scrollHeight, behavior: 'smooth'});
            return;
        }

        scrollingElement.scrollTop = scrollingElement.scrollHeight;
    }, [resolveScrollingElement]);

    return {scrollContainerRef, isScrolledAwayFromBottom, scrollToBottom};
}

export default useScrollToBottom;
