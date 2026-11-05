import {useCallback, useEffect, useId, useMemo, useRef, useState} from 'react';
import {XMarkIcon} from '@heroicons/react/20/solid';
import userDirectoryService, {DIRECTORY_PAGE_SIZE} from '../service/UserDirectoryService.js';
import './UserMultiSelect.css';

export const SEARCH_DEBOUNCE_MILLISECONDS = 200;

const lower = (text) => (typeof text === 'string' ? text.trim().toLowerCase() : '');

/**
 * Picks people from the user directory and shows each choice as a removable chip.
 *
 * @param {{
 *   value: Array<{userId: string, username: string, displayName?: string}>,
 *   onChange: (next: Array<object>) => void,
 *   max?: number,
 *   disabled?: boolean,
 *   invalidUsernames?: string[],
 *   excludeUserIds?: string[],
 *   placeholder?: string,
 *   ariaLabel?: string,
 *   searchUsers?: (query: string, options: {signal: AbortSignal, limit: number}) => Promise<Array<object>>,
 *   debounceMilliseconds?: number,
 * }} props
 */
function UserMultiSelect({
    value,
    onChange,
    max,
    disabled = false,
    invalidUsernames = [],
    excludeUserIds = [],
    placeholder = 'Type a username…',
    ariaLabel = 'Add people',
    searchUsers = userDirectoryService.search,
    debounceMilliseconds = SEARCH_DEBOUNCE_MILLISECONDS,
}) {
    const baseId = useId();
    const listboxId = `${baseId}-listbox`;
    const optionId = (user) => `${baseId}-option-${user.userId}`;

    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [searched, setSearched] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [announcement, setAnnouncement] = useState('');

    const containerRef = useRef(null);
    const inputRef = useRef(null);
    const pendingFocusRef = useRef(null);
    const hiddenIdsRef = useRef(new Set());
    const lastAnnouncedCountRef = useRef(null);
    const skipFocusOpenRef = useRef(false);

    const atMax = typeof max === 'number' && value.length >= max;
    const expanded = open && !atMax && !disabled;

    const hiddenIds = useMemo(() => new Set([...value.map((user) => user.userId), ...excludeUserIds]), [value, excludeUserIds]);

    useEffect(() => {
        hiddenIdsRef.current = hiddenIds;
    }, [hiddenIds]);

    const options = useMemo(() => results.filter((user) => !hiddenIds.has(user.userId)), [results, hiddenIds]);
    const invalidNames = useMemo(() => new Set(invalidUsernames.map(lower)), [invalidUsernames]);

    useEffect(() => {
        if (!expanded) {
            return;
        }

        const controller = new AbortController();
        const delay = query === '' ? 0 : debounceMilliseconds;

        const timeoutId = setTimeout(async () => {
            setLoading(true);
            setLoadFailed(false);

            try {
                const found = await searchUsers(query, {signal: controller.signal, limit: DIRECTORY_PAGE_SIZE});

                if (controller.signal.aborted) {
                    return;
                }

                const list = Array.isArray(found) ? found : [];
                const visible = list.filter((user) => !hiddenIdsRef.current.has(user.userId));

                setResults(list);
                setActiveIndex(-1);
                setLoading(false);
                setSearched(true);

                if (query !== '' || lastAnnouncedCountRef.current !== visible.length) {
                    setAnnouncement(visible.length > 0 ? `${visible.length} users available` : 'No matching users');
                }

                lastAnnouncedCountRef.current = visible.length;
            } catch {
                if (controller.signal.aborted) {
                    return;
                }

                setResults([]);
                setLoadFailed(true);
                setLoading(false);
            }
        }, delay);

        return () => {
            clearTimeout(timeoutId);
            controller.abort();
        };
    }, [expanded, query, searchUsers, debounceMilliseconds]);

    useEffect(() => {
        const target = pendingFocusRef.current;
        pendingFocusRef.current = null;

        if (target === 'input') {
            const input = inputRef.current;

            if (input && document.activeElement !== input) {
                skipFocusOpenRef.current = true;
                input.focus();
                skipFocusOpenRef.current = false;
            }
        } else if (target === 'lastChip') {
            const buttons = containerRef.current?.querySelectorAll('.user-multi-select-chip-remove');
            buttons?.[buttons.length - 1]?.focus();
        }
    }, [value]);

    const select = useCallback((user) => {
        if (atMax) {
            return;
        }

        const next = [...value, user];

        if (typeof max === 'number' && next.length >= max) {
            pendingFocusRef.current = 'lastChip';
        }

        onChange(next);
        setQuery('');
        setActiveIndex(-1);
        setAnnouncement(`${user.username} added, ${next.length} selected`);
    }, [atMax, max, onChange, value]);

    const remove = useCallback((user) => {
        const next = value.filter((candidate) => candidate.userId !== user.userId);

        pendingFocusRef.current = 'input';
        onChange(next);
        setAnnouncement(`${user.username} removed, ${next.length} selected`);
    }, [onChange, value]);

    const exactMatch = () => {
        const wanted = lower(query);

        return wanted ? options.find((user) => lower(user.username) === wanted) : undefined;
    };

    const moveActive = (step) => {
        if (options.length === 0) {
            return;
        }

        setActiveIndex((current) => {
            if (current === -1) {
                return step > 0 ? 0 : options.length - 1;
            }

            return (current + step + options.length) % options.length;
        });
    };

    const handleKeyDown = (event) => {
        switch (event.key) {
            case 'Escape':
                if (expanded) {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen(false);
                    setSearched(false);
                    lastAnnouncedCountRef.current = null;
                    setActiveIndex(-1);
                }
                break;

            case 'ArrowDown':
            case 'ArrowUp':
                event.preventDefault();

                if (!expanded) {
                    setOpen(true);
                } else {
                    moveActive(event.key === 'ArrowDown' ? 1 : -1);
                }
                break;

            case 'Enter': {
                const chosen = expanded && options[activeIndex] ? options[activeIndex] : exactMatch();

                if (chosen) {
                    event.preventDefault();
                    select(chosen);
                } else if (expanded || query.trim() !== '') {
                    event.preventDefault();
                }
                break;
            }

            case 'Tab':
                if (expanded && options[activeIndex]) {
                    event.preventDefault();
                    event.stopPropagation();
                    select(options[activeIndex]);
                }
                break;

            case ',': {
                event.preventDefault();
                const chosen = exactMatch();

                if (chosen) {
                    select(chosen);
                }
                break;
            }

            case 'Backspace':
                if (query === '' && value.length > 0 && !disabled) {
                    remove(value[value.length - 1]);
                }
                break;

            default:
                break;
        }
    };

    const handleBlur = (event) => {
        if (!containerRef.current?.contains(event.relatedTarget)) {
            setOpen(false);
            setSearched(false);
            lastAnnouncedCountRef.current = null;
            setActiveIndex(-1);
        }
    };

    const handleChange = (event) => {
        setQuery(event.target.value);
        setOpen(true);
        setActiveIndex(-1);
    };

    const activeOption = expanded ? options[activeIndex] : undefined;

    let message = null;

    if (expanded && options.length === 0) {
        if (loadFailed) {
            message = 'Could not load users.';
        } else if (loading) {
            message = 'Searching…';
        } else if (searched) {
            message = 'No matching users';
        }
    }

    return (
        <div className="user-multi-select" ref={containerRef} onBlur={handleBlur}>
            <div className="user-multi-select-field" onClick={() => inputRef.current?.focus()}>
                {value.length > 0 && (
                    <ul className="user-multi-select-chips" role="list">
                        {value.map((user) => {
                            const invalid = invalidNames.has(lower(user.username));

                            return (
                                <li
                                    key={user.userId}
                                    className={`user-multi-select-chip${invalid ? ' user-multi-select-chip--invalid' : ''}`}
                                    title={user.displayName || user.username}
                                    {...(invalid ? {'data-invalid': 'true'} : {})}
                                >
                                    <span>{user.username}</span>
                                    {invalid && <span className="user-multi-select-sr-only"> (not found)</span>}
                                    <button
                                        type="button"
                                        className="user-multi-select-chip-remove"
                                        aria-label={`Remove ${user.username}`}
                                        disabled={disabled}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            remove(user);
                                        }}
                                    >
                                        <XMarkIcon aria-hidden="true"/>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}

                <input
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    className="user-multi-select-input"
                    aria-label={ariaLabel}
                    aria-expanded={expanded}
                    aria-controls={expanded ? listboxId : undefined}
                    aria-autocomplete="list"
                    aria-activedescendant={activeOption ? optionId(activeOption) : undefined}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={query}
                    placeholder={value.length === 0 ? placeholder : undefined}
                    disabled={disabled || atMax}
                    onChange={handleChange}
                    onFocus={() => {
                        if (!skipFocusOpenRef.current) {
                            setOpen(true);
                        }
                    }}
                    onKeyDown={handleKeyDown}
                />
            </div>

            {atMax && <p className="user-multi-select-hint">Up to {max} people</p>}

            {expanded && (
                <div className="user-multi-select-popup" onMouseDown={(event) => event.preventDefault()}>
                    <ul id={listboxId} className="user-multi-select-listbox" role="listbox" aria-label="Matching users" aria-busy={loading}>
                        {options.map((user, index) => (
                            <li
                                key={user.userId}
                                id={optionId(user)}
                                role="option"
                                aria-selected={index === activeIndex}
                                className={`user-multi-select-option${index === activeIndex ? ' user-multi-select-option--active' : ''}`}
                                onMouseDown={(event) => event.preventDefault()}
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => select(user)}
                            >
                                <span className="user-multi-select-option-username">{user.username}</span>
                                {user.displayName && user.displayName !== user.username && (
                                    <span className="user-multi-select-option-name">{user.displayName}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                    {message && <p className="user-multi-select-message">{message}</p>}
                </div>
            )}

            <div className="user-multi-select-sr-only" aria-live="polite" role="status">{announcement}</div>
        </div>
    );
}

export default UserMultiSelect;
