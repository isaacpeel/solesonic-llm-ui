import {describe, it, expect, vi, afterEach} from 'vitest';
import {render} from '@testing-library/react';
import {StrictMode} from 'react';

vi.mock('../../src/service/PushSubscriptionService.js', () => ({
    default: {syncOnLoad: vi.fn().mockResolvedValue(undefined)},
}));

import PushSubscriptionSync from '../../src/push/PushSubscriptionSync.jsx';
import pushSubscriptionService from '../../src/service/PushSubscriptionService.js';

afterEach(() => {
    vi.clearAllMocks();
});

describe('PushSubscriptionSync', () => {
    it('syncs once on mount, even under StrictMode, and renders nothing', () => {
        const {container} = render(
            <StrictMode>
                <PushSubscriptionSync/>
            </StrictMode>
        );

        expect(pushSubscriptionService.syncOnLoad).toHaveBeenCalledTimes(1);
        expect(container.innerHTML).toBe('');
    });
});
