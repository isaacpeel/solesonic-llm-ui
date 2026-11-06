import './SoundBlockedButton.css';

function SoundBlockedButton({blockedSound, onPlay}) {
    if (!blockedSound) {
        return null;
    }

    const label = blockedSound.cue === 'theme' ? 'Play theme' : 'Play sound';

    return (
        <button type="button" className="sound-blocked-button" onClick={onPlay}>
            <span aria-hidden="true">🔊</span>
            <span>{label}</span>
        </button>
    );
}

export default SoundBlockedButton;
