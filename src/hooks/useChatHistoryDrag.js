import {useCallback, useEffect, useRef, useState} from "react";

import {
    autoScrollStep,
    dropEdgeForRow,
    dropTargetFromElement,
    isClearOfDrawer,
    isNoOpDrop,
    resolveDropDestination,
} from "../util/chatHistoryDrag.js";

/*
 * How far the pointer travels before a press on a grip becomes a drag. A press that goes nowhere is
 * still a press — it is how the grip is focused for the arrow-key path — and a finger on a
 * touchscreen never holds perfectly still.
 */
const DRAG_THRESHOLD_PIXELS = 6;

/* Identity-compared, so the `+ New group` button needs no field on the destination shape. */
const NEW_GROUP_DESTINATION = Object.freeze({newGroup: true});

/**
 * Pointer-driven dragging for the chat history drawer.
 *
 * Pointer Events rather than the HTML5 drag API, because that API is not implemented for touch
 * input on any mobile browser — `dragstart` simply never fires from a finger, which left the whole
 * feature inert on a phone. Pointer Events are one stream covering mouse, touch and pen, so this
 * replaces the desktop path rather than adding a second one beside it.
 *
 * Two decisions carry most of the weight:
 *
 * `pointermove`, `pointerup` and `pointercancel` are listened for on the window rather than bound
 * to the grip. The grip lives in a virtualized row, and auto-scrolling far enough unmounts that row
 * while the finger is still down, which would take its handlers with it.
 *
 * Pointer capture is taken on the scroll box for the same reason: it is an element that never
 * unmounts, and events dispatched to it still bubble to those window listeners.
 *
 * The grip must also carry `touch-action: none` in CSS. Without it the browser claims a vertical
 * drag as a scroll of the list and cancels the pointer stream before it reaches any of this.
 *
 * @param {{
 *   rows: Array<object>,
 *   scrollContainerRef: {current: HTMLElement|null},
 *   drawerRef: {current: HTMLElement|null},
 *   placedChatsFor: (chatGroupId: string|null) => Array<object>,
 *   onDrop: (chat: object, destination: {chatGroupId: string|null, position: number|null}) => void,
 *   onNewGroup: (chat: object) => void,
 *   onDropOutside: (chat: object, point: {clientX: number, clientY: number}) => void,
 * }} options
 */
function useChatHistoryDrag({
    rows,
    scrollContainerRef,
    drawerRef,
    placedChatsFor,
    onDrop,
    onNewGroup,
    onDropOutside,
}) {
    const [draggedChat, setDraggedChat] = useState(null);
    const [dropTarget, setDropTarget] = useState(null);
    const [newGroupDropActive, setNewGroupDropActive] = useState(false);

    /* The pointer has left the drawer, where releasing offers to delete or to build a group. */
    const [outsideDropActive, setOutsideDropActive] = useState(false);

    /* True from the press to the release. Subscribing the window listeners is all it does. */
    const [pressed, setPressed] = useState(false);

    /* The live gesture. Nothing in it may be state: `pointermove` fires every frame. */
    const gestureRef = useRef(null);

    const autoScrollRef = useRef({frame: null, step: 0});

    /*
     * The window listeners are registered once per press, so they read everything that changes
     * between renders from here instead of from the closure they were created in.
     */
    const latestRef = useRef({rows, placedChatsFor, onDrop, onNewGroup, onDropOutside});

    useEffect(() => {
        latestRef.current = {rows, placedChatsFor, onDrop, onNewGroup, onDropOutside};
    });

    const stopAutoScroll = useCallback(() => {
        if (autoScrollRef.current.frame !== null) {
            window.cancelAnimationFrame(autoScrollRef.current.frame);
        }

        autoScrollRef.current = {frame: null, step: 0};
    }, []);

    /* A frame loop rather than a scroll per move: a finger held still at the edge must keep going. */
    const updateAutoScroll = useCallback((clientX, clientY) => {
        const scrollElement = scrollContainerRef.current;

        if (!scrollElement) {
            return;
        }

        autoScrollRef.current.step = autoScrollStep(
            {clientX, clientY},
            scrollElement.getBoundingClientRect(),
        );

        if (autoScrollRef.current.step === 0 || autoScrollRef.current.frame !== null) {
            return;
        }

        const scrollOneFrame = () => {
            const element = scrollContainerRef.current;

            if (!element || autoScrollRef.current.step === 0) {
                autoScrollRef.current.frame = null;
                return;
            }

            element.scrollTop += autoScrollRef.current.step;
            autoScrollRef.current.frame = window.requestAnimationFrame(scrollOneFrame);
        };

        autoScrollRef.current.frame = window.requestAnimationFrame(scrollOneFrame);
    }, [scrollContainerRef]);

    const endGesture = useCallback(() => {
        const gesture = gestureRef.current;
        const scrollElement = scrollContainerRef.current;

        if (gesture && scrollElement?.hasPointerCapture?.(gesture.pointerId)) {
            scrollElement.releasePointerCapture(gesture.pointerId);
        }

        gestureRef.current = null;

        stopAutoScroll();
        setPressed(false);
        setDraggedChat(null);
        setDropTarget(null);
        setNewGroupDropActive(false);
        setOutsideDropActive(false);
    }, [scrollContainerRef, stopAutoScroll]);

    /*
     * Hit-tests whatever is under the pointer and resolves it. The destination is kept on the
     * gesture as well as rendered, so the release does not have to hit-test a second time against a
     * list the auto-scroll may have moved in the meantime.
     */
    const updateDropTarget = useCallback((clientX, clientY) => {
        const gesture = gestureRef.current;

        if (!gesture) {
            return;
        }

        const {rows: currentRows, placedChatsFor: currentPlacedChatsFor} = latestRef.current;
        const hitElement = document.elementFromPoint(clientX, clientY);
        const hit = dropTargetFromElement(hitElement);

        gesture.outside = false;
        setOutsideDropActive(false);

        if (hit?.newGroup) {
            gesture.destination = NEW_GROUP_DESTINATION;
            setDropTarget(null);
            setNewGroupDropActive(true);
            return;
        }

        setNewGroupDropActive(false);

        const row = hit ? currentRows[hit.rowIndex] : null;

        if (!row) {
            /*
             * Nothing droppable under the pointer. Clear of the drawer altogether that is a gesture
             * in its own right — the release offers to delete the conversation or to build a group
             * around it. A null element means the pointer has left the viewport, which is someone
             * abandoning the drag rather than aiming at anything.
             */
            gesture.destination = null;
            gesture.outside = !!hitElement && isClearOfDrawer(
                drawerRef.current?.getBoundingClientRect(),
                {clientX, clientY},
            );

            setDropTarget(null);
            setOutsideDropActive(gesture.outside);
            return;
        }

        const edge = dropEdgeForRow(row, clientY, hit.rowElement.getBoundingClientRect());
        const destination = resolveDropDestination(row, edge, {
            draggedChatId: gesture.chat.id,
            draggedChatGroupId: gesture.chat.chatGroupId ?? null,
            placedChatsFor: currentPlacedChatsFor,
        });

        if (!destination) {
            gesture.destination = null;
            setDropTarget(null);
            return;
        }

        /*
         * An indicator is a promise that releasing here moves something. Dropping a dated
         * conversation back onto a day header, or a row onto the neighbour it already sits beside,
         * changes nothing — drawing a line for it is how a working drag still reads as broken.
         */
        const sameList = (gesture.chat.chatGroupId ?? null) === (destination.chatGroupId ?? null);

        if (sameList && isNoOpDrop(currentPlacedChatsFor(destination.chatGroupId), gesture.chat.id, destination.position)) {
            gesture.destination = null;
            setDropTarget(null);
            return;
        }

        gesture.destination = destination;

        setDropTarget(previousTarget => (
            previousTarget?.rowKey === row.key && previousTarget.edge === edge
                ? previousTarget
                : {rowKey: row.key, edge}
        ));
    }, [drawerRef]);

    const handlePointerMove = useCallback((event) => {
        const gesture = gestureRef.current;

        if (!gesture || event.pointerId !== gesture.pointerId) {
            return;
        }

        if (!gesture.dragging) {
            const travelled = Math.max(
                Math.abs(event.clientX - gesture.startClientX),
                Math.abs(event.clientY - gesture.startClientY),
            );

            if (travelled < DRAG_THRESHOLD_PIXELS) {
                return;
            }

            gesture.dragging = true;
            setDraggedChat(gesture.chat);
        }

        updateDropTarget(event.clientX, event.clientY);
        updateAutoScroll(event.clientX, event.clientY);
    }, [updateDropTarget, updateAutoScroll]);

    const handlePointerUp = useCallback((event) => {
        const gesture = gestureRef.current;

        if (!gesture || event.pointerId !== gesture.pointerId) {
            return;
        }

        const {dragging, chat, destination, outside} = gesture;
        const {
            onDrop: dropHandler,
            onNewGroup: newGroupHandler,
            onDropOutside: outsideHandler,
        } = latestRef.current;

        endGesture();

        /* A press that never travelled focused the grip and nothing more. */
        if (!dragging) {
            return;
        }

        if (outside) {
            outsideHandler(chat, {clientX: event.clientX, clientY: event.clientY});
            return;
        }

        if (!destination) {
            return;
        }

        if (destination === NEW_GROUP_DESTINATION) {
            newGroupHandler(chat);
            return;
        }

        dropHandler(chat, destination);
    }, [endGesture]);

    const handlePointerCancel = useCallback((event) => {
        const gesture = gestureRef.current;

        if (gesture && event.pointerId !== gesture.pointerId) {
            return;
        }

        endGesture();
    }, [endGesture]);

    /*
     * Escape abandons the drag. It matters more than it looks: releasing clear of the drawer now
     * opens a menu with Delete in it, so there has to be a way to think better of a drag that is
     * already out there.
     */
    const handleKeyDown = useCallback((event) => {
        if (event.key !== "Escape" || !gestureRef.current) {
            return;
        }

        event.preventDefault();
        endGesture();
    }, [endGesture]);

    useEffect(() => {
        if (!pressed) {
            return;
        }

        window.addEventListener("pointermove", handlePointerMove, {passive: false});
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerCancel);
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerCancel);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [pressed, handlePointerMove, handlePointerUp, handlePointerCancel, handleKeyDown]);

    /* A drawer torn down mid-drag would otherwise leave the scroll loop running against nothing. */
    useEffect(() => stopAutoScroll, [stopAutoScroll]);

    const beginGesture = useCallback((event, chat) => {
        /* One pointer at a time: a second finger landing during a drag is not a second drag. */
        if (gestureRef.current) {
            return;
        }

        /* `.chat-item`'s own onClick opens the conversation; a press on its grip must not reach it. */
        event.stopPropagation();

        /*
         * Cancels the compatibility mouse events, and with them the click the browser sends on
         * release — which would otherwise open the very conversation that was just dragged.
         * Focusing then falls to this handler, because giving the button focus is part of the
         * default that has just been prevented, and the arrow-key path needs the grip focused.
         */
        event.preventDefault();
        event.currentTarget.focus?.();

        scrollContainerRef.current?.setPointerCapture?.(event.pointerId);

        gestureRef.current = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            chat,
            dragging: false,
            destination: null,
            outside: false,
        };

        setPressed(true);
    }, [scrollContainerRef]);

    const dragHandleProps = useCallback((chat) => ({
        onPointerDown: (event) => beginGesture(event, chat),
    }), [beginGesture]);

    return {draggedChat, dropTarget, newGroupDropActive, outsideDropActive, dragHandleProps};
}

export default useChatHistoryDrag;
