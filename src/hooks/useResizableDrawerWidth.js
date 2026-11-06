import {useCallback, useEffect, useMemo, useRef, useState} from "react";

const STORAGE_KEY = "chatHistoryDrawerWidth";
const WIDTH_PROPERTY = "--chat-drawer-width";

export const DEFAULT_DRAWER_WIDTH = 250;
export const MINIMUM_DRAWER_WIDTH = 220;
const MAXIMUM_DRAWER_WIDTH = 640;
const VIEWPORT_MARGIN = 40;
const KEYBOARD_STEP = 16;

/* The mouseup that ends a drag lands outside the drawer as often as not and must not close it. */
const RELEASE_GRACE_MILLISECONDS = 300;

function maximumWidth() {
    const viewportWidth = typeof window === "undefined" ? MAXIMUM_DRAWER_WIDTH : window.innerWidth - VIEWPORT_MARGIN;

    return Math.max(MINIMUM_DRAWER_WIDTH, Math.min(MAXIMUM_DRAWER_WIDTH, viewportWidth));
}

export function clampDrawerWidth(width) {
    return Math.round(Math.min(Math.max(width, MINIMUM_DRAWER_WIDTH), maximumWidth()));
}

function readStoredWidth() {
    try {
        const stored = Number.parseInt(window.localStorage.getItem(STORAGE_KEY), 10);

        return Number.isFinite(stored) ? clampDrawerWidth(stored) : DEFAULT_DRAWER_WIDTH;
    } catch {
        return DEFAULT_DRAWER_WIDTH;
    }
}

function storeWidth(width) {
    try {
        window.localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
        // Storage can be unavailable (private mode); the width just won't be remembered.
    }
}

/**
 * Width of the chat history drawer, set as a CSS variable on the root so `.drawer` (owned by the
 * header) and anything else sized against it follow without prop threading. Persisted per browser.
 */
export default function useResizableDrawerWidth() {
    const [width, setWidth] = useState(readStoredWidth);
    const [resizing, setResizing] = useState(false);
    const dragRef = useRef(null);
    const releasedAtRef = useRef(0);

    useEffect(() => {
        document.documentElement.style.setProperty(WIDTH_PROPERTY, `${width}px`);
    }, [width]);

    useEffect(() => {
        const handleWindowResize = () => setWidth(current => clampDrawerWidth(current));

        window.addEventListener("resize", handleWindowResize);
        return () => window.removeEventListener("resize", handleWindowResize);
    }, []);

    useEffect(() => {
        if (!resizing) {
            return undefined;
        }

        const previousUserSelect = document.body.style.userSelect;
        document.body.style.userSelect = "none";

        return () => {
            document.body.style.userSelect = previousUserSelect;
        };
    }, [resizing]);

    const finishDrag = useCallback((event) => {
        if (!dragRef.current) {
            return;
        }

        event.currentTarget.releasePointerCapture?.(event.pointerId);
        dragRef.current = null;
        releasedAtRef.current = performance.now();
        setResizing(false);
        setWidth(current => {
            storeWidth(current);
            return current;
        });
    }, []);

    const handleProps = useMemo(() => ({
        onPointerDown: (event) => {
            if (event.button !== undefined && event.button !== 0) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            dragRef.current = {startX: event.clientX, startWidth: width};
            setResizing(true);
        },
        onPointerMove: (event) => {
            const drag = dragRef.current;

            if (drag) {
                setWidth(clampDrawerWidth(drag.startWidth + event.clientX - drag.startX));
            }
        },
        onPointerUp: finishDrag,
        onPointerCancel: finishDrag,
        onClick: (event) => event.stopPropagation(),
        onDoubleClick: () => {
            setWidth(DEFAULT_DRAWER_WIDTH);
            storeWidth(DEFAULT_DRAWER_WIDTH);
        },
        onKeyDown: (event) => {
            const step = event.key === "ArrowRight" ? KEYBOARD_STEP : event.key === "ArrowLeft" ? -KEYBOARD_STEP : 0;

            if (step === 0) {
                return;
            }

            event.preventDefault();
            const nextWidth = clampDrawerWidth(width + step);
            setWidth(nextWidth);
            storeWidth(nextWidth);
        },
    }), [width, finishDrag]);

    const consumeResizeRelease = useCallback(() => {
        if (dragRef.current) {
            return true;
        }

        const recent = performance.now() - releasedAtRef.current < RELEASE_GRACE_MILLISECONDS;
        releasedAtRef.current = 0;

        return recent;
    }, []);

    return {
        width,
        resizing,
        minimumWidth: MINIMUM_DRAWER_WIDTH,
        maximumWidth: maximumWidth(),
        handleProps,
        consumeResizeRelease,
    };
}
