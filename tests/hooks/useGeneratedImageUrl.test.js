import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, waitFor} from '@testing-library/react';

vi.mock('../../src/util/generatedImageObjectUrlCache.js', () => ({
    acquireGeneratedImageObjectUrl: vi.fn(),
    releaseGeneratedImageObjectUrl: vi.fn(),
}));

import useGeneratedImageUrl from '../../src/hooks/useGeneratedImageUrl.js';
import {
    acquireGeneratedImageObjectUrl,
    releaseGeneratedImageObjectUrl,
} from '../../src/util/generatedImageObjectUrlCache.js';

beforeEach(() => {
    acquireGeneratedImageObjectUrl.mockResolvedValue('blob:image-1');
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('useGeneratedImageUrl', () => {
    it('acquires the blob URL for an image id', async () => {
        const {result} = renderHook(() => useGeneratedImageUrl('image-1'));

        expect(result.current.loading).toBe(true);

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(acquireGeneratedImageObjectUrl).toHaveBeenCalledWith('image-1');
        expect(result.current.objectUrl).toBe('blob:image-1');
        expect(result.current.error).toBeNull();
    });

    it('fetches nothing while deferred, so an image below the fold costs no bytes', () => {
        const {result} = renderHook(() => useGeneratedImageUrl('image-1', {deferred: true}));

        expect(result.current).toEqual({objectUrl: null, loading: false, error: null});
        expect(acquireGeneratedImageObjectUrl).not.toHaveBeenCalled();
    });

    it('acquires once the caller stops deferring', async () => {
        const {result, rerender} = renderHook(({deferred}) => useGeneratedImageUrl('image-1', {deferred}), {
            initialProps: {deferred: true},
        });

        rerender({deferred: false});

        await waitFor(() => expect(result.current.objectUrl).toBe('blob:image-1'));

        expect(acquireGeneratedImageObjectUrl).toHaveBeenCalledWith('image-1');
    });

    it('releases the cache entry on unmount', async () => {
        const {result, unmount} = renderHook(() => useGeneratedImageUrl('image-1'));

        await waitFor(() => expect(result.current.loading).toBe(false));

        unmount();

        expect(releaseGeneratedImageObjectUrl).toHaveBeenCalledWith('image-1');
    });

    it('reports a 404 as missing so the caller can render a placeholder', async () => {
        acquireGeneratedImageObjectUrl.mockRejectedValue(Object.assign(new Error('gone'), {status: 404}));

        const {result} = renderHook(() => useGeneratedImageUrl('image-1'));

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.error).toBe('missing');
        expect(result.current.objectUrl).toBeNull();
    });

    it('reports any other failure as failed', async () => {
        acquireGeneratedImageObjectUrl.mockRejectedValue(Object.assign(new Error('boom'), {status: 500}));

        const {result} = renderHook(() => useGeneratedImageUrl('image-1'));

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.error).toBe('failed');
    });

    it('does nothing without an image id', () => {
        const {result} = renderHook(() => useGeneratedImageUrl(null));

        expect(result.current).toEqual({objectUrl: null, loading: false, error: null});
        expect(acquireGeneratedImageObjectUrl).not.toHaveBeenCalled();
    });
});
