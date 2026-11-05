import {describe, it, expect, vi} from 'vitest';
import {renderHook, waitFor} from '@testing-library/react';
import useCommandAvailable from '../../src/hooks/useCommandAvailable.js';

describe('useCommandAvailable', () => {
    it('is true once the command is in the list', async () => {
        const fetchCommands = vi.fn().mockResolvedValue([{command: 'logbook'}, {command: 'logs'}]);
        const {result} = renderHook(() => useCommandAvailable(fetchCommands, 'logs'));

        expect(result.current).toBe(false);
        await waitFor(() => expect(result.current).toBe(true));
        expect(fetchCommands).toHaveBeenCalledWith('logs');
    });

    it('is false when the command is missing, the fetch fails, or there is no fetcher', async () => {
        const missing = renderHook(() => useCommandAvailable(vi.fn().mockResolvedValue([{command: 'logbook'}]), 'logs'));
        const failing = renderHook(() => useCommandAvailable(vi.fn().mockRejectedValue(new Error('down')), 'logs'));
        const none = renderHook(() => useCommandAvailable(null, 'logs'));
        const throwing = renderHook(() => useCommandAvailable(() => {
            throw new TypeError('not a function');
        }, 'logs'));

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(missing.result.current).toBe(false);
        expect(failing.result.current).toBe(false);
        expect(none.result.current).toBe(false);
        expect(throwing.result.current).toBe(false);
    });
});
