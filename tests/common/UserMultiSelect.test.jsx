import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent, act, within} from '@testing-library/react';
import {useState} from 'react';

vi.mock('../../src/service/UserDirectoryService.js', () => ({
    default: {search: vi.fn()},
    DIRECTORY_PAGE_SIZE: 20,
}));

import UserMultiSelect from '../../src/common/UserMultiSelect.jsx';

const ALICE = {userId: 'u-alice', username: 'alice', displayName: 'Alice Anders'};
const BOB = {userId: 'u-bob', username: 'bob', displayName: 'Bob Brown'};
const CAROL = {userId: 'u-carol', username: 'carol', displayName: 'Carol Chan'};
const DIRECTORY = [ALICE, BOB, CAROL];

let searchUsers;
let onChangeSpy;

function Harness({initial = [], ...props}) {
    const [value, setValue] = useState(initial);

    return (
        <UserMultiSelect
            value={value}
            onChange={(next) => {
                onChangeSpy(next);
                setValue(next);
            }}
            searchUsers={searchUsers}
            {...props}
        />
    );
}

const combobox = () => screen.getByRole('combobox');

async function settle(milliseconds = 250) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(milliseconds);
    });
}

async function openList(props) {
    const view = render(<Harness {...props}/>);

    fireEvent.focus(combobox());
    await settle();

    return view;
}

function chipNames() {
    const list = screen.queryByRole('list');

    return list ? within(list).queryAllByRole('listitem').map((item) => item.textContent.replace(/\s*\(not found\)$/, '')) : [];
}

beforeEach(() => {
    vi.useFakeTimers();
    onChangeSpy = vi.fn();
    searchUsers = vi.fn().mockResolvedValue(DIRECTORY);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('UserMultiSelect roles and announcements', () => {
    it('exposes a combobox that controls a listbox of options', async () => {
        await openList();

        const input = combobox();
        const listbox = screen.getByRole('listbox');

        expect(input.getAttribute('aria-expanded')).toBe('true');
        expect(input.getAttribute('aria-controls')).toBe(listbox.id);
        expect(input.getAttribute('aria-autocomplete')).toBe('list');
        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
            expect.stringContaining('alice'),
            expect.stringContaining('bob'),
            expect.stringContaining('carol'),
        ]);
    });

    it('starts collapsed with no active descendant', () => {
        render(<Harness/>);

        expect(combobox().getAttribute('aria-expanded')).toBe('false');
        expect(combobox().hasAttribute('aria-activedescendant')).toBe(false);
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('announces how many users are available through a polite live region', async () => {
        await openList();

        const live = document.querySelector('[aria-live="polite"]');

        expect(live).not.toBeNull();
        expect(live.textContent).toMatch(/3 users available/i);
    });

    it('announces a selection and a removal', async () => {
        await openList();
        fireEvent.click(screen.getAllByRole('option')[0]);
        const live = document.querySelector('[aria-live="polite"]');

        expect(live.textContent).toMatch(/alice added, 1 selected/i);

        fireEvent.click(screen.getByRole('button', {name: 'Remove alice'}));

        expect(live.textContent).toMatch(/alice removed, 0 selected/i);
    });

    it('lists chips in a list and puts the display name in the title', async () => {
        render(<Harness initial={[ALICE, BOB]}/>);

        expect(chipNames()).toEqual(['alice', 'bob']);
        expect(screen.getByText('alice').closest('li').getAttribute('title')).toBe('Alice Anders');
    });
});

describe('UserMultiSelect searching', () => {
    it('searches with the empty query as soon as it is focused', async () => {
        await openList();

        expect(searchUsers).toHaveBeenCalledTimes(1);
        expect(searchUsers.mock.calls[0][0]).toBe('');
    });

    it('waits for typing to pause before searching', async () => {
        await openList();
        searchUsers.mockClear();

        fireEvent.change(combobox(), {target: {value: 'a'}});
        await settle(100);
        fireEvent.change(combobox(), {target: {value: 'al'}});
        await settle(100);
        fireEvent.change(combobox(), {target: {value: 'ali'}});
        await settle(199);

        expect(searchUsers).not.toHaveBeenCalled();

        await settle(1);

        expect(searchUsers).toHaveBeenCalledTimes(1);
        expect(searchUsers.mock.calls[0][0]).toBe('ali');
    });

    it('aborts the previous request when the query changes', async () => {
        const signals = [];
        searchUsers.mockImplementation((query, {signal}) => {
            signals.push(signal);
            return new Promise(() => {});
        });

        await openList();
        fireEvent.change(combobox(), {target: {value: 'b'}});
        await settle();

        expect(signals).toHaveLength(2);
        expect(signals[0].aborted).toBe(true);
        expect(signals[1].aborted).toBe(false);
    });

    it('aborts the request when it unmounts', async () => {
        const signals = [];
        searchUsers.mockImplementation((query, {signal}) => {
            signals.push(signal);
            return new Promise(() => {});
        });

        const {unmount} = await openList();
        unmount();

        expect(signals[0].aborted).toBe(true);
    });

    it('ignores an answer that arrives after it was superseded', async () => {
        let resolveFirst;
        searchUsers
            .mockImplementationOnce(() => new Promise((resolve) => {
                resolveFirst = resolve;
            }))
            .mockResolvedValue([CAROL]);

        await openList();
        fireEvent.change(combobox(), {target: {value: 'c'}});
        await settle();
        await act(async () => resolveFirst([ALICE]));

        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([expect.stringContaining('carol')]);
    });

    it('shows a searching state while the request is open', async () => {
        searchUsers.mockImplementation(() => new Promise(() => {}));

        await openList();

        expect(screen.getByText('Searching…')).toBeTruthy();
        expect(screen.getByRole('listbox').getAttribute('aria-busy')).toBe('true');
    });

    it('says when no user matches', async () => {
        searchUsers.mockResolvedValue([]);

        await openList();

        expect(document.querySelector('.user-multi-select-message').textContent).toBe('No matching users');
    });

    it('says when the directory could not be read', async () => {
        searchUsers.mockRejectedValue(new Error('down'));

        await openList();

        expect(screen.getByText('Could not load users.')).toBeTruthy();
    });

    it('leaves out people already chosen or already seated', async () => {
        await openList({initial: [ALICE], excludeUserIds: ['u-bob']});

        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([expect.stringContaining('carol')]);
    });
});

describe('UserMultiSelect choosing and removing', () => {
    it('adds a chip when an option is clicked', async () => {
        await openList();

        fireEvent.click(screen.getAllByRole('option')[1]);

        expect(onChangeSpy).toHaveBeenCalledWith([BOB]);
        expect(chipNames()).toEqual(['bob']);
        expect(combobox().value).toBe('');
    });

    it('removes a chip with its remove button', () => {
        render(<Harness initial={[ALICE, BOB]}/>);

        fireEvent.click(screen.getByRole('button', {name: 'Remove alice'}));

        expect(onChangeSpy).toHaveBeenCalledWith([BOB]);
        expect(chipNames()).toEqual(['bob']);
    });

    it('removes the last chip on Backspace in an empty input', () => {
        render(<Harness initial={[ALICE, BOB]}/>);

        fireEvent.keyDown(combobox(), {key: 'Backspace'});

        expect(onChangeSpy).toHaveBeenCalledWith([ALICE]);
    });

    it('does not remove a chip on Backspace while there is text to delete', () => {
        render(<Harness initial={[ALICE]}/>);
        fireEvent.change(combobox(), {target: {value: 'b'}});

        fireEvent.keyDown(combobox(), {key: 'Backspace'});

        expect(onChangeSpy).not.toHaveBeenCalled();
    });

    it('does nothing on Backspace with no chips', () => {
        render(<Harness/>);

        fireEvent.keyDown(combobox(), {key: 'Backspace'});

        expect(onChangeSpy).not.toHaveBeenCalled();
    });

    it('marks the chips the server rejected', () => {
        render(<Harness initial={[ALICE, BOB]} invalidUsernames={['Bob']}/>);

        const bobChip = screen.getByText('bob').closest('li');

        expect(bobChip.getAttribute('data-invalid')).toBe('true');
        expect(bobChip.textContent).toMatch(/not found/);
        expect(screen.getByText('alice').closest('li').hasAttribute('data-invalid')).toBe(false);
    });

    it('returns focus to the input after a chip is removed', () => {
        render(<Harness initial={[ALICE]}/>);

        fireEvent.click(screen.getByRole('button', {name: 'Remove alice'}));

        expect(document.activeElement).toBe(combobox());
    });
});

describe('UserMultiSelect keyboard', () => {
    it('moves the active option with the arrow keys and wraps around', async () => {
        await openList();
        const options = screen.getAllByRole('option');

        fireEvent.keyDown(combobox(), {key: 'ArrowDown'});
        expect(combobox().getAttribute('aria-activedescendant')).toBe(options[0].id);
        expect(options[0].getAttribute('aria-selected')).toBe('true');

        fireEvent.keyDown(combobox(), {key: 'ArrowDown'});
        expect(combobox().getAttribute('aria-activedescendant')).toBe(options[1].id);

        fireEvent.keyDown(combobox(), {key: 'ArrowUp'});
        fireEvent.keyDown(combobox(), {key: 'ArrowUp'});
        expect(combobox().getAttribute('aria-activedescendant')).toBe(options[2].id);

        fireEvent.keyDown(combobox(), {key: 'ArrowDown'});
        expect(combobox().getAttribute('aria-activedescendant')).toBe(options[0].id);
    });

    it('opens a closed list with the down arrow', async () => {
        await openList();
        fireEvent.keyDown(combobox(), {key: 'Escape'});
        expect(combobox().getAttribute('aria-expanded')).toBe('false');

        fireEvent.keyDown(combobox(), {key: 'ArrowDown'});

        expect(combobox().getAttribute('aria-expanded')).toBe('true');
    });

    it('selects the active option on Enter', async () => {
        await openList();

        fireEvent.keyDown(combobox(), {key: 'ArrowDown'});
        fireEvent.keyDown(combobox(), {key: 'ArrowDown'});
        fireEvent.keyDown(combobox(), {key: 'Enter'});

        expect(onChangeSpy).toHaveBeenCalledWith([BOB]);
    });

    it('selects the active option on Tab and keeps focus where it is', async () => {
        await openList();

        fireEvent.keyDown(combobox(), {key: 'ArrowDown'});
        const notPrevented = fireEvent.keyDown(combobox(), {key: 'Tab'});

        expect(onChangeSpy).toHaveBeenCalledWith([ALICE]);
        expect(notPrevented).toBe(false);
    });

    it('lets Tab through when no option is active', async () => {
        await openList();

        const notPrevented = fireEvent.keyDown(combobox(), {key: 'Tab'});

        expect(onChangeSpy).not.toHaveBeenCalled();
        expect(notPrevented).toBe(true);
    });

    it('closes the list on Escape without letting the dialog behind it close', async () => {
        const outerKeyDown = vi.fn();
        render(<div onKeyDown={outerKeyDown}><Harness/></div>);
        fireEvent.focus(combobox());
        await settle();

        fireEvent.keyDown(combobox(), {key: 'Escape'});

        expect(combobox().getAttribute('aria-expanded')).toBe('false');
        expect(outerKeyDown).not.toHaveBeenCalled();
    });

    it('lets Escape through when the list is already closed', () => {
        const outerKeyDown = vi.fn();
        render(<div onKeyDown={outerKeyDown}><Harness/></div>);

        fireEvent.keyDown(combobox(), {key: 'Escape'});

        expect(outerKeyDown).toHaveBeenCalled();
    });

    it('selects an exact username match on Enter', async () => {
        await openList();
        fireEvent.change(combobox(), {target: {value: 'BOB'}});
        await settle();

        fireEvent.keyDown(combobox(), {key: 'Enter'});

        expect(onChangeSpy).toHaveBeenCalledWith([BOB]);
    });

    it('selects an exact username match on a comma and swallows the comma', async () => {
        await openList();
        fireEvent.change(combobox(), {target: {value: 'carol'}});
        await settle();

        const notPrevented = fireEvent.keyDown(combobox(), {key: ','});

        expect(onChangeSpy).toHaveBeenCalledWith([CAROL]);
        expect(notPrevented).toBe(false);
    });

    it('does not guess when Enter finds no exact match', async () => {
        await openList();
        fireEvent.change(combobox(), {target: {value: 'ca'}});
        await settle();

        fireEvent.keyDown(combobox(), {key: 'Enter'});

        expect(onChangeSpy).not.toHaveBeenCalled();
    });
});

describe('UserMultiSelect limits and states', () => {
    it('disables the input and says so when the maximum is reached', async () => {
        render(<Harness initial={[ALICE, BOB]} max={2}/>);

        expect(combobox().disabled).toBe(true);
        expect(screen.getByText('Up to 2 people')).toBeTruthy();
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('does not search once the maximum is reached', async () => {
        render(<Harness initial={[ALICE]} max={1}/>);

        fireEvent.focus(combobox());
        await settle();

        expect(searchUsers).not.toHaveBeenCalled();
    });

    it('takes the input back when a chip is removed from a full field', () => {
        render(<Harness initial={[ALICE, BOB]} max={2}/>);

        fireEvent.click(screen.getByRole('button', {name: 'Remove bob'}));

        expect(combobox().disabled).toBe(false);
        expect(document.activeElement).toBe(combobox());
    });

    it('moves focus to the last chip button when choosing the last allowed person', async () => {
        await openList({initial: [ALICE], max: 2});

        fireEvent.click(screen.getAllByRole('option')[0]);

        expect(combobox().disabled).toBe(true);
        expect(document.activeElement).toBe(screen.getByRole('button', {name: 'Remove bob'}));
    });

    it('disables everything while disabled', () => {
        render(<Harness initial={[ALICE]} disabled/>);

        expect(combobox().disabled).toBe(true);
        expect(screen.getByRole('button', {name: 'Remove alice'}).disabled).toBe(true);
    });

    it('shows the placeholder only while there are no chips', () => {
        const {rerender} = render(<Harness placeholder="Find people"/>);
        expect(combobox().getAttribute('placeholder')).toBe('Find people');

        rerender(<Harness initial={[ALICE]} key="other" placeholder="Find people"/>);
        expect(combobox().hasAttribute('placeholder')).toBe(false);
    });

    it('closes the list when focus leaves', async () => {
        await openList();

        fireEvent.blur(combobox(), {relatedTarget: document.body});

        expect(combobox().getAttribute('aria-expanded')).toBe('false');
    });

    it('asks the directory for no more than a page of users', async () => {
        await openList();

        expect(searchUsers.mock.calls[0][1].limit).toBe(20);
    });

    it('does not reopen the list when focus returns after a chip is removed', async () => {
        render(<Harness initial={[ALICE]}/>);

        fireEvent.click(screen.getByRole('button', {name: 'Remove alice'}));
        await settle();

        expect(combobox().getAttribute('aria-expanded')).toBe('false');
        expect(searchUsers).not.toHaveBeenCalled();
    });

    it('swallows Enter with nothing typed and nothing active while the list is open', async () => {
        await openList();

        const notPrevented = fireEvent.keyDown(combobox(), {key: 'Enter'});

        expect(notPrevented).toBe(false);
    });

    it('lets Enter through while the list is closed', () => {
        render(<Harness/>);

        const notPrevented = fireEvent.keyDown(combobox(), {key: 'Enter'});

        expect(notPrevented).toBe(true);
    });

    it('keeps focus in the input when the popup itself is pressed', async () => {
        await openList();

        const notPrevented = fireEvent.mouseDown(document.querySelector('.user-multi-select-popup'));

        expect(notPrevented).toBe(false);
    });

    it('announces a changed count after typing', async () => {
        await openList();
        const live = document.querySelector('[aria-live="polite"]');
        searchUsers.mockResolvedValue([ALICE]);

        fireEvent.change(combobox(), {target: {value: 'al'}});
        await settle();

        expect(live.textContent).toBe('1 users available');
    });

    it('only points aria-controls at the listbox while it exists', async () => {
        render(<Harness/>);
        expect(combobox().hasAttribute('aria-controls')).toBe(false);

        fireEvent.focus(combobox());
        await settle();

        expect(combobox().getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
    });
});
