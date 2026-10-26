import {useState} from 'react';
import {readGameSoundsEnabled, writeGameSoundsEnabled} from '../util/soundPreferences.js';

const GameSoundsSetting = () => {
    const [gameSoundsEnabled, setGameSoundsEnabled] = useState(readGameSoundsEnabled);

    const handleToggle = (event) => {
        const enabled = event.target.checked;

        setGameSoundsEnabled(enabled);
        writeGameSoundsEnabled(enabled);
    };

    return (
        <div className="general-settings-profile-row">
            <label className="general-settings-profile-label" htmlFor="game-sounds-setting-toggle">Game sounds</label>
            <div className="general-settings-profile-value">
                <input
                    id="game-sounds-setting-toggle"
                    type="checkbox"
                    className="game-sounds-setting-toggle"
                    checked={gameSoundsEnabled}
                    onChange={handleToggle}
                />
            </div>
        </div>
    );
};

export default GameSoundsSetting;
