import {useCallback, useEffect, useId, useRef, useState} from 'react';
import {EllipsisVerticalIcon} from '@heroicons/react/20/solid';
import './ChatHeader.css';

export function ChatHeaderMenu({label = 'Chat options', locked = false, focusKey, onClose, children}) {
    const [open, setOpen] = useState(false);
    const [returnFocusOnClose, setReturnFocusOnClose] = useState(false);
    const triggerRef = useRef(null);
    const panelRef = useRef(null);
    const wasOpenRef = useRef(false);
    const panelId = useId();
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    const close = useCallback(({returnFocus = false} = {}) => {
        setReturnFocusOnClose(returnFocus);
        setOpen(false);
    }, []);

    useEffect(() => {
        if (open) {
            wasOpenRef.current = true;
            panelRef.current?.querySelector('button:not([disabled]), a[href]')?.focus();
            return;
        }

        if (!wasOpenRef.current) {
            return;
        }

        wasOpenRef.current = false;
        onCloseRef.current?.();

        if (returnFocusOnClose) {
            triggerRef.current?.focus();
        }
    }, [open, focusKey, returnFocusOnClose]);

    useEffect(() => {
        if (!open || locked) {
            return undefined;
        }

        const handlePointerDown = (event) => {
            if (!panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
                close();
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                close({returnFocus: true});
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, locked, close]);

    return (
        <div className="chat-header-menu">
            <button
                ref={triggerRef}
                type="button"
                className="chat-header-icon-button"
                aria-label={label}
                title={label}
                aria-haspopup="true"
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                onClick={() => (open ? close() : setOpen(true))}
            >
                <EllipsisVerticalIcon aria-hidden="true"/>
            </button>

            {open && (
                <div ref={panelRef} id={panelId} className="chat-header-panel" role="group" aria-label={label}>
                    {children({close})}
                </div>
            )}
        </div>
    );
}

function ChatHeader({leading, title, subtitle, busy = false, trailing, children, className = ''}) {
    return (
        <header className={`chat-header ${className}`.trim()}>
            <div className="chat-header-bar">
                {leading}
                <div className="chat-header-title">
                    <h1 className="chat-header-name" title={title}>{title}</h1>
                    {subtitle && (
                        <p className="chat-header-subtitle" role="status">
                            {busy && <span className="chat-header-busy-dot" aria-hidden="true"/>}
                            <span className="chat-header-subtitle-text">{subtitle}</span>
                        </p>
                    )}
                </div>
                {trailing}
                {children}
            </div>
            <div className={`chat-header-progress${busy ? ' chat-header-progress--active' : ''}`} aria-hidden="true"/>
        </header>
    );
}

export default ChatHeader;
