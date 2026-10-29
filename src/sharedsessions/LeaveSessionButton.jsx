import {useEffect, useRef, useState} from 'react';
import {ArrowRightStartOnRectangleIcon, CheckIcon, XMarkIcon} from '@heroicons/react/20/solid';
import './LeaveSessionButton.css';

const CONFIRM_TIMEOUT_MILLISECONDS = 5000;

function LeaveSessionButton({onConfirm}) {
    const [confirming, setConfirming] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const containerRef = useRef(null);
    const leaveButtonRef = useRef(null);
    const cancelButtonRef = useRef(null);
    const restoreFocusRef = useRef(false);

    const dismiss = () => {
        restoreFocusRef.current = !!containerRef.current?.contains(document.activeElement);
        setConfirming(false);
    };

    useEffect(() => {
        if (confirming) {
            cancelButtonRef.current?.focus();
            return;
        }

        if (restoreFocusRef.current) {
            restoreFocusRef.current = false;
            leaveButtonRef.current?.focus();
        }
    }, [confirming]);

    useEffect(() => {
        if (!confirming || leaving) {
            return;
        }

        const timeoutId = setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MILLISECONDS);

        const handlePointerDown = (event) => {
            if (!containerRef.current?.contains(event.target)) {
                setConfirming(false);
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                restoreFocusRef.current = true;
                setConfirming(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [confirming, leaving]);

    const handleConfirm = async () => {
        setLeaving(true);

        try {
            await onConfirm();
        } finally {
            setLeaving(false);
            setConfirming(false);
        }
    };

    return (
        <div className="leave-session" ref={containerRef}>
            {confirming ? (
                <div className="leave-session-confirm" role="group" aria-labelledby="leave-session-confirm-text">
                    <span id="leave-session-confirm-text" className="leave-session-confirm-text">End for everyone?</span>
                    <button
                        type="button"
                        className="leave-session-icon-button leave-session-icon-button--danger"
                        onClick={handleConfirm}
                        disabled={leaving}
                        aria-label="End the session for everyone"
                        title="End the session for everyone"
                    >
                        <CheckIcon/>
                    </button>
                    <button
                        type="button"
                        ref={cancelButtonRef}
                        className="leave-session-icon-button"
                        onClick={dismiss}
                        disabled={leaving}
                        aria-label="Keep the session"
                        title="Keep the session"
                    >
                        <XMarkIcon/>
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    ref={leaveButtonRef}
                    className="leave-session-icon-button leave-session-trigger"
                    onClick={() => setConfirming(true)}
                    aria-label="Leave session"
                    title="Leave session"
                >
                    <ArrowRightStartOnRectangleIcon/>
                </button>
            )}
        </div>
    );
}

export default LeaveSessionButton;
