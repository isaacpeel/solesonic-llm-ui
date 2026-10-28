import {useState} from 'react';
import {readAgentSoundsEnabled, writeAgentSoundsEnabled} from '../util/soundPreferences.js';

const AgentSoundsSetting = () => {
    const [agentSoundsEnabled, setAgentSoundsEnabled] = useState(readAgentSoundsEnabled);

    const handleToggle = (event) => {
        const enabled = event.target.checked;

        setAgentSoundsEnabled(enabled);
        writeAgentSoundsEnabled(enabled);
    };

    return (
        <div className="general-settings-profile-row">
            <label className="general-settings-profile-label" htmlFor="agent-sounds-setting-toggle">Agent sounds</label>
            <div className="general-settings-profile-value">
                <input
                    id="agent-sounds-setting-toggle"
                    type="checkbox"
                    className="agent-sounds-setting-toggle"
                    checked={agentSoundsEnabled}
                    onChange={handleToggle}
                />
            </div>
        </div>
    );
};

export default AgentSoundsSetting;
