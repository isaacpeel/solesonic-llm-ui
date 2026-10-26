import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, fireEvent, cleanup} from '@testing-library/react';

vi.mock('../../src/util/soundPreferences.js', () => ({
    readGameSoundsEnabled: vi.fn(),
    writeGameSoundsEnabled: vi.fn(),
}));

import GameSoundsSetting from '../../src/settings/GameSoundsSetting.jsx';
import {readGameSoundsEnabled, writeGameSoundsEnabled} from '../../src/util/soundPreferences.js';

function renderToggle() {
    const {container} = render(<GameSoundsSetting/>);

    return container.querySelector('.game-sounds-setting-toggle');
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('GameSoundsSetting', () => {
    it('shows game sounds on when the stored preference is on', () => {
        readGameSoundsEnabled.mockReturnValue(true);

        expect(renderToggle().checked).toBe(true);
    });

    it('shows game sounds off when the stored preference is off', () => {
        readGameSoundsEnabled.mockReturnValue(false);

        expect(renderToggle().checked).toBe(false);
    });

    it('stores the new choice when toggled', () => {
        readGameSoundsEnabled.mockReturnValue(true);
        const toggle = renderToggle();

        fireEvent.click(toggle);

        expect(writeGameSoundsEnabled).toHaveBeenCalledWith(false);
        expect(toggle.checked).toBe(false);
    });
});
