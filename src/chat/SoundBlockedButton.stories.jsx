import SoundBlockedButton from './SoundBlockedButton.jsx';

export default {
    title: 'Chat/SoundBlockedButton',
    component: SoundBlockedButton,
    argTypes: {
        onPlay: {action: 'played'},
    },
};

export const BlockedTheme = {
    args: {
        blockedSound: {cueId: 'sound-cue-1', soundId: 'a'.repeat(64), cue: 'theme', playOnce: true},
    },
};

export const BlockedOtherSound = {
    args: {
        blockedSound: {cueId: 'sound-cue-2', soundId: 'b'.repeat(64), cue: 'buzzer', playOnce: false},
    },
};
