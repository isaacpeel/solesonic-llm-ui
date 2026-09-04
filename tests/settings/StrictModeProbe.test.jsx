import {StrictMode, useEffect, useRef} from 'react';
import {render} from '@testing-library/react';
import {describe, it, expect, vi} from 'vitest';

describe('StrictMode probe', () => {
    it('double-invokes effects and preserves refs', () => {
        const effectRuns = vi.fn();
        const guardedRuns = vi.fn();

        const Probe = () => {
            const started = useRef(false);

            useEffect(() => {
                effectRuns();

                if (started.current) {
                    return;
                }

                started.current = true;
                guardedRuns();
            }, []);

            return null;
        };

        render(<StrictMode><Probe/></StrictMode>);

        expect(effectRuns).toHaveBeenCalledTimes(2);
        expect(guardedRuns).toHaveBeenCalledTimes(1);
    });
});
