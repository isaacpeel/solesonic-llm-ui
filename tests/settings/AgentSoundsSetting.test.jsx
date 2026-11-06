import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, fireEvent, cleanup} from '@testing-library/react';

vi.mock('../../src/util/soundPreferences.js', () => ({
    readAgentSoundsEnabled: vi.fn(),
    writeAgentSoundsEnabled: vi.fn(),
}));

import AgentSoundsSetting from '../../src/settings/AgentSoundsSetting.jsx';
import {readAgentSoundsEnabled, writeAgentSoundsEnabled} from '../../src/util/soundPreferences.js';

function renderToggle() {
    const {container} = render(<AgentSoundsSetting/>);

    return container.querySelector('.agent-sounds-setting-toggle');
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('AgentSoundsSetting', () => {
    it('shows agent sounds on when the stored preference is on', () => {
        readAgentSoundsEnabled.mockReturnValue(true);

        expect(renderToggle().checked).toBe(true);
    });

    it('shows agent sounds off when the stored preference is off', () => {
        readAgentSoundsEnabled.mockReturnValue(false);

        expect(renderToggle().checked).toBe(false);
    });

    it('stores the new choice when toggled', () => {
        readAgentSoundsEnabled.mockReturnValue(true);
        const toggle = renderToggle();

        fireEvent.click(toggle);

        expect(writeAgentSoundsEnabled).toHaveBeenCalledWith(false);
        expect(toggle.checked).toBe(false);
    });
});
