import {useEffect, useId, useRef, useState} from 'react';
import './ModelPicker.css';
import {
    PICKER_ERROR_FAILED,
    PICKER_ERROR_NO_ACCESS,
    PICKER_ERROR_UNAVAILABLE,
    PICKER_ERROR_UNKNOWN_MODEL,
} from '../../hooks/useChatModel.js';
import {NO_MODEL_ACCESS_MESSAGE} from '../../service/LlmKeyService.js';
import useIsMobile from '../../hooks/useIsMobile.js';
import {visibleModels} from '../../util/modelLabels.js';

function ModelPicker({options, loading, saving, error, pendingModel, onChoose, onRetry, onClose}) {
    const [filterText, setFilterText] = useState('');
    const [activeIndex, setActiveIndex] = useState(-1);
    const containerRef = useRef(null);
    const listId = useId();
    const isMobile = useIsMobile();

    useEffect(() => {
        if (isMobile) {
            document.activeElement?.blur?.();
        }
    }, [isMobile]);

    useEffect(() => {
        const handleDocumentMouseDown = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                onClose();
            }
        };

        /*
         * Deferred so the mousedown that opened the picker (a tap on the /model row) has finished
         * propagating; attached synchronously, that same event reaches document and closes it.
         */
        const listenerTimeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleDocumentMouseDown);
        }, 0);

        return () => {
            clearTimeout(listenerTimeoutId);
            document.removeEventListener('mousedown', handleDocumentMouseDown);
        };
    }, [onClose]);

    const models = visibleModels(options?.models);
    const defaultModel = options?.defaultModel ?? null;
    const selection = options?.selectedModel ?? pendingModel ?? null;
    const currentModel = selection ?? defaultModel;
    const normalizedFilter = filterText.trim().toLowerCase();

    const filteredModels = models.filter((model) => model.id.toLowerCase().includes(normalizedFilter)
        || (model.displayName ?? '').toLowerCase().includes(normalizedFilter));
    const rows = filteredModels.map((model) => ({key: model.id, model}));

    const isCurrent = (model) => !!currentModel && model.id.toLowerCase() === currentModel.toLowerCase();

    const pickRow = (row) => {
        if (!row || saving) {
            return;
        }

        if (isCurrent(row.model)) {
            onClose();
            return;
        }

        onChoose(row.model.id);
    };

    const handleFilterChange = (event) => {
        setFilterText(event.target.value);
        setActiveIndex(-1);
    };

    const handleFilterKeyDown = (event) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((previous) => Math.min(previous + 1, rows.length - 1));
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((previous) => Math.max(previous - 1, -1));
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();

            if (activeIndex >= 0) {
                pickRow(rows[activeIndex]);
                return;
            }

            if (rows.length === 1) {
                pickRow(rows[0]);
            }
        }
    };

    const renderBody = () => {
        if (loading && !options) {
            return <div className="model-picker-message">Loading models…</div>;
        }

        if (error === PICKER_ERROR_NO_ACCESS) {
            return (
                <div className="model-picker-message model-picker-message--error" role="alert">
                    {NO_MODEL_ACCESS_MESSAGE}
                </div>
            );
        }

        if (error === PICKER_ERROR_UNAVAILABLE) {
            return (
                <div className="model-picker-message model-picker-message--error" role="alert">
                    <span>The model list could not be loaded.</span>
                    <button type="button" className="model-picker-retry" onClick={onRetry}>
                        Retry
                    </button>
                </div>
            );
        }

        if (models.length === 0) {
            return <div className="model-picker-message">No models are available.</div>;
        }

        if (rows.length === 0) {
            return <div className="model-picker-message">No models match “{filterText.trim()}”.</div>;
        }

        return (
            <ul className="model-picker-list" role="listbox" id={listId} aria-label="Models">
                {rows.map((row, index) => {
                    const isActive = index === activeIndex;
                    const itemClassName = `model-picker-item${isActive ? ' model-picker-item--active' : ''}`;

                    return (
                        <li
                            key={row.key}
                            role="option"
                            aria-selected={isActive}
                            aria-disabled={saving}
                            className={itemClassName}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                pickRow(row);
                            }}
                        >
                            <span className="model-picker-item-heading">
                                <span className="model-picker-item-name">{row.model.displayName || row.model.id}</span>
                                {isCurrent(row.model) && (
                                    <span className="model-picker-badge model-picker-badge--current">Current</span>
                                )}
                            </span>
                            {row.model.ownedBy && (
                                <span className="model-picker-item-owner">{row.model.ownedBy}</span>
                            )}
                        </li>
                    );
                })}
            </ul>
        );
    };

    return (
        <div className="model-picker" ref={containerRef}>
            <input
                type="text"
                className="model-picker-filter"
                placeholder="Filter models…"
                aria-label="Filter models"
                aria-controls={listId}
                autoFocus={!isMobile}
                value={filterText}
                onChange={handleFilterChange}
                onKeyDown={handleFilterKeyDown}
            />

            {error === PICKER_ERROR_UNKNOWN_MODEL && (
                <div className="model-picker-message model-picker-message--error" role="alert">
                    That model is no longer available — pick another.
                </div>
            )}

            {error === PICKER_ERROR_FAILED && (
                <div className="model-picker-message model-picker-message--error" role="alert">
                    The model could not be changed. Please try again.
                </div>
            )}

            {renderBody()}
        </div>
    );
}

export default ModelPicker;
