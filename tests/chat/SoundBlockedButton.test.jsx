import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, fireEvent, cleanup} from '@testing-library/react';
import SoundBlockedButton from '../../src/chat/SoundBlockedButton.jsx';

const themeCue = {cueId: 'sound-cue-1', soundId: 'a'.repeat(64), cue: 'theme', playOnce: true};

afterEach(() => {
    cleanup();
});

describe('SoundBlockedButton', () => {
    it('renders nothing while no sound is blocked', () => {
        const {container} = render(<SoundBlockedButton blockedSound={null} onPlay={vi.fn()}/>);

        expect(container.querySelector('.sound-blocked-button')).toBeNull();
    });

    it('offers to play a blocked theme', () => {
        const {container} = render(<SoundBlockedButton blockedSound={themeCue} onPlay={vi.fn()}/>);

        expect(container.querySelector('.sound-blocked-button').textContent).toContain('Play theme');
    });

    it('names any other cue as a sound', () => {
        const {container} = render(<SoundBlockedButton blockedSound={{...themeCue, cue: 'buzzer'}} onPlay={vi.fn()}/>);

        expect(container.querySelector('.sound-blocked-button').textContent).toContain('Play sound');
    });

    it('plays the sound on click', () => {
        const onPlay = vi.fn();
        const {container} = render(<SoundBlockedButton blockedSound={themeCue} onPlay={onPlay}/>);

        fireEvent.click(container.querySelector('.sound-blocked-button'));

        expect(onPlay).toHaveBeenCalledOnce();
    });
});
