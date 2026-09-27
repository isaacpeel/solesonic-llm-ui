import {useEffect, useState} from 'react';

/*
 * Mobile browsers do not keep position:fixed elements glued to the visible (visual) viewport
 * when the on-screen keyboard opens or a dynamic toolbar collapses — they track the layout
 * viewport instead. window.visualViewport reports the actual visible area, so the gap between
 * it and window.innerHeight is exactly how far a fixed bottom:0 element needs to move up.
 */
function useKeyboardInset() {
    const [keyboardInset, setKeyboardInset] = useState(0);

    useEffect(() => {
        const visualViewport = window.visualViewport;

        if (!visualViewport) {
            return undefined;
        }

        const measureKeyboardInset = () => {
            const rawInset = window.innerHeight - visualViewport.height - visualViewport.offsetTop;
            setKeyboardInset(Math.max(0, Math.round(rawInset)));
        };

        measureKeyboardInset();

        visualViewport.addEventListener('resize', measureKeyboardInset);
        visualViewport.addEventListener('scroll', measureKeyboardInset);

        return () => {
            visualViewport.removeEventListener('resize', measureKeyboardInset);
            visualViewport.removeEventListener('scroll', measureKeyboardInset);
        };
    }, []);

    return keyboardInset;
}

export default useKeyboardInset;
