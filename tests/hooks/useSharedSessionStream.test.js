import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {renderHook, waitFor} from '@testing-library/react';

vi.mock('../../src/service/SharedSessionService.js', async (importOriginal) => {
    const original = await importOriginal();

    return {
        ...original,
        default: {
            session: vi.fn(),
            messages: vi.fn(),
            watch: vi.fn(),
        },
    };
});

import sharedSessionService from '../../src/service/SharedSessionService.js';
import useSharedSessionStream from '../../src/hooks/useSharedSessionStream.js';

const SESSION = {id: 'session-1', mode: 'CONVERSATION', status: 'ACTIVE', participants: []};

function failingWatch(status) {
    return async function* () {
        const error = new Error(`${status}: GET`);
        error.status = status;
        throw error;
    };
}

describe('useSharedSessionStream', () => {
    beforeEach(() => {
        sharedSessionService.session.mockResolvedValue(SESSION);
        sharedSessionService.messages.mockResolvedValue([]);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('stops following and reports the error when the stream answers 404', async () => {
        sharedSessionService.watch.mockImplementation(failingWatch(404));

        const {result} = renderHook(() => useSharedSessionStream({sessionId: 'session-1', viewerUserId: 'user-1'}));

        await waitFor(() => expect(result.current.loadError?.status).toBe(404));

        await new Promise((resolve) => setTimeout(resolve, 1200));

        expect(sharedSessionService.watch).toHaveBeenCalledTimes(1);
        expect(result.current.connected).toBe(false);
    });

    it('keeps reconnecting after other stream failures', async () => {
        sharedSessionService.watch.mockImplementation(failingWatch(502));

        const {result} = renderHook(() => useSharedSessionStream({sessionId: 'session-1', viewerUserId: 'user-1'}));

        await waitFor(() => expect(sharedSessionService.watch).toHaveBeenCalledTimes(2), {timeout: 2500});

        expect(result.current.loadError).toBeNull();
    });

    it('counts an open stream with no frames yet as connected', async () => {
        let release;
        const held = new Promise((resolve) => {
            release = resolve;
        });

        sharedSessionService.watch.mockImplementation(async function* (sessionId, {onOpen}) {
            onOpen?.();
            await held;
        });

        const {result, unmount} = renderHook(() => useSharedSessionStream({sessionId: 'session-1', viewerUserId: 'user-1'}));

        await waitFor(() => expect(result.current.connected).toBe(true));

        unmount();
        release();
    });

    it('counts keepalives on an idle stream as connected', async () => {
        let release;
        const held = new Promise((resolve) => {
            release = resolve;
        });

        sharedSessionService.watch.mockImplementation(async function* (sessionId, {onActivity}) {
            onActivity?.();
            await held;
        });

        const {result, unmount} = renderHook(() => useSharedSessionStream({sessionId: 'session-1', viewerUserId: 'user-1'}));

        await waitFor(() => expect(result.current.connected).toBe(true));

        unmount();
        release();
    });
});
