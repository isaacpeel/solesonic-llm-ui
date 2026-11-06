import {render, screen, waitFor, fireEvent, act} from '@testing-library/react';
import {describe, it, vi, expect, beforeEach, afterEach} from 'vitest';
import {MemoryRouter} from 'react-router';

vi.mock('../../src/service/InterestService.js', () => ({
    default: {
        getPendingOffers: vi.fn(),
        declineOffer: vi.fn(),
    },
}));

import InterestOfferBanner from '../../src/interests/InterestOfferBanner.jsx';
import isEmptyNewConversation from '../../src/interests/isEmptyNewConversation.js';
import interestService from '../../src/service/InterestService.js';

const OFFER = {id: 'offer-1', agentType: 'NEWS', label: 'Formula 1', status: 'PENDING'};
const FIVE_MINUTES = 5 * 60 * 1000;

let storedItems;
let visibilityState;
let now;

function renderBanner(showing = true) {
    return render(
        <MemoryRouter>
            <InterestOfferBanner showing={showing}/>
        </MemoryRouter>
    );
}

function rerenderBanner(rerender, showing) {
    rerender(
        <MemoryRouter>
            <InterestOfferBanner showing={showing}/>
        </MemoryRouter>
    );
}

const banner = () => document.querySelector('.interest-offer-banner');

function becomeVisibleAfter(milliseconds) {
    now += milliseconds;
    visibilityState = 'visible';

    act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    storedItems = new Map();
    visibilityState = 'visible';
    now = Date.parse('2026-10-21T12:00:00Z');

    vi.stubGlobal('sessionStorage', {
        getItem: vi.fn((key) => (storedItems.has(key) ? storedItems.get(key) : null)),
        setItem: vi.fn((key, value) => storedItems.set(key, value)),
        removeItem: vi.fn((key) => storedItems.delete(key)),
    });
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    interestService.getPendingOffers.mockResolvedValue([OFFER]);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('InterestOfferBanner', () => {
    it('offers a pending suggestion on the empty new-conversation screen', async () => {
        renderBanner();

        await waitFor(() => expect(banner()).not.toBeNull());

        expect(banner().textContent).toContain('I can keep you posted on Formula 1');
        expect(screen.getByRole('link', {name: 'Review'}).getAttribute('href')).toBe('/interests/offers/offer-1');
    });

    it('renders nothing and asks nothing while not showing', async () => {
        renderBanner(false);

        await act(async () => {
            await Promise.resolve();
        });

        expect(banner()).toBeNull();
        expect(interestService.getPendingOffers).not.toHaveBeenCalled();
    });

    it('disappears once the screen stops being empty', async () => {
        const {rerender} = renderBanner();
        await waitFor(() => expect(banner()).not.toBeNull());

        rerenderBanner(rerender, false);

        expect(banner()).toBeNull();
    });

    it('hides a dismissed offer for the session without declining it', async () => {
        const {unmount} = renderBanner();
        await waitFor(() => expect(banner()).not.toBeNull());

        fireEvent.click(screen.getByRole('button', {name: 'Dismiss suggestion'}));

        expect(banner()).toBeNull();
        expect(interestService.declineOffer).not.toHaveBeenCalled();
        expect(storedItems.get('interest.offer.dismissed.offer-1')).toBe('true');

        unmount();
        renderBanner();

        await waitFor(() => expect(interestService.getPendingOffers).toHaveBeenCalledTimes(2));
        expect(banner()).toBeNull();
    });

    it('still dismisses when session storage is unavailable', async () => {
        const throwingStorage = () => {
            throw new Error('storage disabled');
        };
        vi.stubGlobal('sessionStorage', {getItem: throwingStorage, setItem: throwingStorage, removeItem: throwingStorage});

        renderBanner();
        await waitFor(() => expect(banner()).not.toBeNull());

        fireEvent.click(screen.getByRole('button', {name: 'Dismiss suggestion'}));

        expect(banner()).toBeNull();
    });

    it('renders nothing when there is no pending offer', async () => {
        interestService.getPendingOffers.mockResolvedValue([]);

        renderBanner();

        await waitFor(() => expect(interestService.getPendingOffers).toHaveBeenCalled());
        expect(banner()).toBeNull();
    });

    it('renders nothing when the request fails', async () => {
        interestService.getPendingOffers.mockRejectedValue(new Error('network down'));

        renderBanner();

        await waitFor(() => expect(interestService.getPendingOffers).toHaveBeenCalled());
        expect(banner()).toBeNull();
    });

    it('checks again when the window returns after five minutes, not sooner', async () => {
        interestService.getPendingOffers.mockResolvedValueOnce([]);
        renderBanner();
        await waitFor(() => expect(interestService.getPendingOffers).toHaveBeenCalledTimes(1));

        becomeVisibleAfter(FIVE_MINUTES - 1000);
        expect(interestService.getPendingOffers).toHaveBeenCalledTimes(1);

        becomeVisibleAfter(1000);

        await waitFor(() => expect(banner()).not.toBeNull());
        expect(interestService.getPendingOffers).toHaveBeenCalledTimes(2);
    });

    it('renders the label as text', async () => {
        interestService.getPendingOffers.mockResolvedValue([{...OFFER, label: '<em>Formula 1</em>'}]);

        renderBanner();

        await waitFor(() => expect(banner()).not.toBeNull());
        expect(banner().querySelector('em')).toBeNull();
        expect(banner().textContent).toContain('<em>Formula 1</em>');
    });
});

describe('isEmptyNewConversation', () => {
    it('is true with no chat and no messages, or only the welcome message', () => {
        expect(isEmptyNewConversation(null, [])).toBe(true);
        expect(isEmptyNewConversation(null, [{type: 'ASSISTANT', ephemeral: true}])).toBe(true);
    });

    it('is false for an existing chat or once a message is sent', () => {
        expect(isEmptyNewConversation('chat-1', [])).toBe(false);
        expect(isEmptyNewConversation(null, [{type: 'USER', text: 'hi'}])).toBe(false);
    });
});
