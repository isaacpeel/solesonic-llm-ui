import {useEffect, useId, useRef, useState} from 'react';
import {CheckIcon, ChevronDownIcon} from '@heroicons/react/20/solid';
import {
    PICKER_ERROR_FAILED,
    PICKER_ERROR_NO_ACCESS,
    PICKER_ERROR_UNAVAILABLE,
    PICKER_ERROR_UNKNOWN_MODEL,
} from '../../hooks/useChatModel.js';
import {NO_MODEL_ACCESS_MESSAGE} from '../../service/LlmKeyService.js';
import './ModelSelect.css';

const DEFAULT_ROW = '__default__';

function errorText(error) {
    switch (error) {
        case PICKER_ERROR_NO_ACCESS:
            return NO_MODEL_ACCESS_MESSAGE;
        case PICKER_ERROR_UNAVAILABLE:
            return 'The model list could not be loaded.';
        case PICKER_ERROR_UNKNOWN_MODEL:
            return 'That model is no longer available. Pick another.';
        case PICKER_ERROR_FAILED:
            return 'The model could not be changed. Try again.';
        default:
            return null;
    }
}

function ModelSelect({chatModel, fallbackLabel}) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const containerRef = useRef(null);
    const buttonRef = useRef(null);
    const listRef = useRef(null);
    const listId = useId();

    const options = chatModel.options;
    const models = options?.models ?? [];
    const defaultModel = options?.defaultModel ?? chatModel.defaultModel ?? null;
    const selectedId = chatModel.pendingModel ?? chatModel.selectedModel ?? null;
    const label = chatModel.displayModel || fallbackLabel || 'Default model';
    const saving = !!chatModel.savingModel;
    const message = errorText(chatModel.pickerError);

    const rows = [
        {id: DEFAULT_ROW, label: defaultModel ? `Default (${defaultModel})` : 'Default model', selected: !selectedId},
        ...models.map((model) => ({id: model.id, label: model.id, selected: model.id === selectedId})),
    ];

    const close = ({returnFocus = false} = {}) => {
        setOpen(false);
        setActiveIndex(-1);

        if (returnFocus) {
            buttonRef.current?.focus();
        }
    };

    const openMenu = () => {
        setOpen(true);
        setActiveIndex(-1);
        chatModel.refreshOptions();
    };

    useEffect(() => {
        if (!open) {
            return undefined;
        }

        listRef.current?.focus();

        const handlePointerDown = (event) => {
            if (!containerRef.current?.contains(event.target)) {
                setOpen(false);
                setActiveIndex(-1);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [open]);

    const pick = async (row) => {
        if (!row || saving) {
            return;
        }

        const changed = row.id === DEFAULT_ROW
            ? await chatModel.resetToDefault()
            : await chatModel.choose(row.id);

        if (changed) {
            close({returnFocus: true});
        }
    };

    const handleListKeyDown = (event) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, rows.length - 1));
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
            return;
        }

        if (event.key === 'Escape' || event.key === 'Tab') {
            close({returnFocus: event.key === 'Escape'});
            return;
        }

        if ((event.key === 'Enter' || event.key === ' ') && activeIndex >= 0) {
            event.preventDefault();
            void pick(rows[activeIndex]);
        }
    };

    const showList = !(chatModel.loadingOptions && !options) && chatModel.pickerError !== PICKER_ERROR_NO_ACCESS
        && chatModel.pickerError !== PICKER_ERROR_UNAVAILABLE;

    return (
        <div className="model-select" ref={containerRef}>
            <button
                ref={buttonRef}
                type="button"
                className="model-select-button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-label={`Model: ${label}`}
                title={label}
                onClick={() => (open ? close() : openMenu())}
                onKeyDown={(event) => {
                    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                        event.preventDefault();
                        openMenu();
                    }
                }}
            >
                <span className="model-select-label">{label}</span>
                <ChevronDownIcon className={`model-select-chevron${open ? ' model-select-chevron--open' : ''}`} aria-hidden="true"/>
            </button>

            {open && (
                <div className="model-select-panel">
                    {chatModel.loadingOptions && !options && <div className="model-select-message">Loading models…</div>}
                    {message && (
                        <div className="model-select-message model-select-message--error" role="alert">
                            <span>{message}</span>
                            {chatModel.pickerError === PICKER_ERROR_UNAVAILABLE && (
                                <button type="button" className="model-select-retry" onClick={chatModel.refreshOptions}>Retry</button>
                            )}
                        </div>
                    )}
                    {options?.activeAgent && (
                        <div className="model-select-message">
                            Routed to <code>{options.activeAgent}</code>. The model applies once it is released.
                        </div>
                    )}
                    {showList && (
                        <ul
                            ref={listRef}
                            id={listId}
                            className="model-select-list"
                            role="listbox"
                            aria-label="Model"
                            tabIndex={-1}
                            aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
                            aria-busy={saving}
                            onKeyDown={handleListKeyDown}
                        >
                            {rows.map((row, index) => (
                                <li
                                    key={row.id}
                                    id={`${listId}-${index}`}
                                    role="option"
                                    aria-selected={row.selected}
                                    aria-disabled={saving}
                                    className={`model-select-option${index === activeIndex ? ' model-select-option--active' : ''}${row.selected ? ' model-select-option--selected' : ''}`}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onClick={() => void pick(row)}
                                >
                                    <span className="model-select-option-label">{row.label}</span>
                                    {row.selected && <CheckIcon className="model-select-check" aria-hidden="true"/>}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

export default ModelSelect;
