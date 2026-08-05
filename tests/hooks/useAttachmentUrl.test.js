import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, waitFor} from '@testing-library/react';

vi.mock('../../src/util/attachmentObjectUrlCache.js', () => ({
    acquireAttachmentObjectUrl: vi.fn(),
    releaseAttachmentObjectUrl: vi.fn(),
}));

import useAttachmentUrl from '../../src/hooks/useAttachmentUrl.js';
import {acquireAttachmentObjectUrl, releaseAttachmentObjectUrl} from '../../src/util/attachmentObjectUrlCache.js';

beforeEach(() => {
    acquireAttachmentObjectUrl.mockResolvedValue('blob:fetched-1');
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('useAttachmentUrl', () => {
    it('short-circuits on a localObjectUrl without touching the cache', () => {
        const {result} = renderHook(() => useAttachmentUrl('a1', {localObjectUrl: 'blob:local-1'}));

        expect(result.current).toEqual({objectUrl: 'blob:local-1', loading: false, error: null});
        expect(acquireAttachmentObjectUrl).not.toHaveBeenCalled();
    });

    it('acquires from the cache when there is no local URL', async () => {
        const {result} = renderHook(() => useAttachmentUrl('a1'));

        expect(result.current.loading).toBe(true);

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(acquireAttachmentObjectUrl).toHaveBeenCalledWith('a1');
        expect(result.current.objectUrl).toBe('blob:fetched-1');
        expect(result.current.error).toBeNull();
    });

    it('releases the cache entry on unmount', async () => {
        const {result, unmount} = renderHook(() => useAttachmentUrl('a1'));

        await waitFor(() => expect(result.current.loading).toBe(false));

        unmount();

        expect(releaseAttachmentObjectUrl).toHaveBeenCalledWith('a1');
    });

    it('reports a 404 as a missing error so the caller can render a placeholder', async () => {
        acquireAttachmentObjectUrl.mockRejectedValue(Object.assign(new Error('gone'), {status: 404}));

        const {result} = renderHook(() => useAttachmentUrl('a1'));

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.error).toBe('missing');
        expect(result.current.objectUrl).toBeNull();
    });

    it('reports any other failure as failed', async () => {
        acquireAttachmentObjectUrl.mockRejectedValue(Object.assign(new Error('boom'), {status: 500}));

        const {result} = renderHook(() => useAttachmentUrl('a1'));

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.error).toBe('failed');
    });

    it('does nothing without an attachment id', () => {
        const {result} = renderHook(() => useAttachmentUrl(null));

        expect(result.current).toEqual({objectUrl: null, loading: false, error: null});
        expect(acquireAttachmentObjectUrl).not.toHaveBeenCalled();
    });

    it('releases the previous id and acquires the new one when the id changes', async () => {
        const {result, rerender} = renderHook(({attachmentId}) => useAttachmentUrl(attachmentId), {
            initialProps: {attachmentId: 'a1'},
        });

        await waitFor(() => expect(result.current.loading).toBe(false));

        acquireAttachmentObjectUrl.mockResolvedValue('blob:fetched-2');
        rerender({attachmentId: 'a2'});

        await waitFor(() => expect(result.current.objectUrl).toBe('blob:fetched-2'));

        expect(releaseAttachmentObjectUrl).toHaveBeenCalledWith('a1');
        expect(acquireAttachmentObjectUrl).toHaveBeenCalledWith('a2');
    });
});
