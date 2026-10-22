import {render, screen, waitFor, fireEvent, act} from '@testing-library/react';
import {describe, it, vi, expect, beforeEach} from 'vitest';
import {createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes, useLocation} from 'react-router';

vi.mock('../../src/service/InterestService.js', async (importOriginal) => {
    const original = await importOriginal();

    return {
        ...original,
        default: {
            getOffer: vi.fn(),
            acceptOffer: vi.fn(),
            declineOffer: vi.fn(),
        },
    };
});

vi.mock('react-toastify', () => ({
    toast: Object.assign(vi.fn(), {success: vi.fn(), error: vi.fn(), info: vi.fn()}),
}));

import InterestOfferScreen from '../../src/interests/InterestOfferScreen.jsx';
import interestService from '../../src/service/InterestService.js';
import {ApiError} from '../../src/client/ApiClient.js';
import {toast} from 'react-toastify';

const FUTURE = '2099-01-01T00:00:00Z';
const PAST = '2020-01-01T00:00:00Z';

const offerWith = (overrides = {}) => ({
    id: 'offer-1',
    agentType: 'NEWS',
    label: 'Formula 1',
    rationale: 'you often talk about Formula 1',
    status: 'PENDING',
    created: '2026-10-20T12:00:00Z',
    expires: FUTURE,
    ...overrides,
});

const apiError = (status, code) => new ApiError({message: `${status}: ${code}`, status, method: 'POST', uri: '/x', code});

function LocationProbe() {
    const location = useLocation();

    return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderScreen(initialEntry = '/interests/offers/offer-1') {
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
                <Route path="/interests/offers/:offerId" element={<InterestOfferScreen/>}/>
                <Route path="/" element={<div data-testid="home"/>}/>
                <Route path="/settings/interests" element={<div data-testid="interest-settings"/>}/>
            </Routes>
            <LocationProbe/>
        </MemoryRouter>
    );
}

const enableButton = () => screen.getByRole('button', {name: 'Enable'});

const currentLocation = () => screen.getByTestId('location').textContent;

beforeEach(() => {
    vi.clearAllMocks();
    interestService.getOffer.mockResolvedValue(offerWith());
    interestService.acceptOffer.mockResolvedValue({id: 'agent-1'});
    interestService.declineOffer.mockResolvedValue(null);
});

describe('InterestOfferScreen states', () => {
    it('shows a skeleton while loading', () => {
        interestService.getOffer.mockReturnValue(new Promise(() => {}));

        renderScreen();

        expect(document.querySelector('.interest-offer-skeleton')).not.toBeNull();
    });

    it('asks about a pending offer with Daily selected', async () => {
        renderScreen();

        await waitFor(() => expect(enableButton()).toBeDefined());

        expect(interestService.getOffer).toHaveBeenCalledWith('offer-1');
        expect(document.querySelector('.interest-offer-title').textContent).toBe('Get news about Formula 1?');
        expect(document.querySelector('.interest-offer-rationale').textContent).toBe('Suggested because you often talk about Formula 1');
        expect(screen.getByRole('radio', {name: 'Daily'}).getAttribute('aria-checked')).toBe('true');
        expect(screen.getByRole('radio', {name: 'Weekly'}).getAttribute('aria-checked')).toBe('false');
        expect(screen.getByRole('button', {name: 'Not now'})).toBeDefined();
        expect(document.querySelector('.interest-offer-why').getAttribute('href')).toBe('/settings/memory');
    });

    it('treats a pending offer past its expiry as expired and never accepts it', async () => {
        interestService.getOffer.mockResolvedValue(offerWith({expires: PAST}));

        renderScreen('/interests/offers/offer-1?intent=accept');

        await waitFor(() => expect(document.querySelector('.interest-offer-closed')).not.toBeNull());

        expect(screen.getByText('This suggestion has expired.')).toBeDefined();
        expect(screen.queryByRole('button', {name: 'Enable'})).toBeNull();
        expect(interestService.acceptOffer).not.toHaveBeenCalled();
    });

    it('says the topic is already followed for an accepted offer', async () => {
        interestService.getOffer.mockResolvedValue(offerWith({status: 'ACCEPTED'}));

        renderScreen();

        await waitFor(() => expect(screen.getByText('You\'re following Formula 1.')).toBeDefined());
        expect(document.querySelector('.interest-offer-manage').getAttribute('href')).toBe('/settings/interests');
    });

    it.each([
        ['DECLINED', 'You turned this suggestion down.'],
        ['EXPIRED', 'This suggestion has expired.'],
        ['WITHDRAWN', 'This suggestion was withdrawn because the memories behind it were removed.'],
    ])('explains a %s offer and links back to chat', async (status, message) => {
        interestService.getOffer.mockResolvedValue(offerWith({status}));

        renderScreen();

        await waitFor(() => expect(screen.getByText(message)).toBeDefined());
        expect(screen.getByRole('link', {name: 'Back to chat'}).getAttribute('href')).toBe('/');
    });

    it('says the suggestion is gone on a 404', async () => {
        interestService.getOffer.mockRejectedValue(apiError(404, 'OFFER_NOT_FOUND'));

        renderScreen();

        await waitFor(() => expect(screen.getByText('This suggestion is no longer available.')).toBeDefined());
        expect(screen.getByRole('link', {name: 'Back to chat'})).toBeDefined();
    });

    it('offers a retry when the offer cannot be loaded', async () => {
        interestService.getOffer.mockRejectedValueOnce(apiError(500, undefined));

        renderScreen();

        await waitFor(() => expect(screen.getByRole('button', {name: 'Retry'})).toBeDefined());

        fireEvent.click(screen.getByRole('button', {name: 'Retry'}));

        await waitFor(() => expect(enableButton()).toBeDefined());
    });

    it('renders a label and rationale containing markup as text', async () => {
        interestService.getOffer.mockResolvedValue(offerWith({
            label: '<script>alert(1)</script>',
            rationale: '<em>you</em> follow it',
        }));

        renderScreen();

        await waitFor(() => expect(enableButton()).toBeDefined());

        expect(document.querySelector('script')).toBeNull();
        expect(document.querySelector('.interest-offer-screen em')).toBeNull();
        expect(document.querySelector('.interest-offer-rationale').textContent).toBe('Suggested because <em>you</em> follow it');
        expect(document.querySelector('.interest-offer-title').textContent).toBe('Get news about <script>alert(1)</script>?');
    });
});

describe('InterestOfferScreen switching offers', () => {
    it('never shows the previous offer while the next one loads', async () => {
        const router = createMemoryRouter(
            [{path: '/interests/offers/:offerId', element: <InterestOfferScreen/>}],
            {initialEntries: ['/interests/offers/offer-1']},
        );
        render(<RouterProvider router={router}/>);
        await waitFor(() => expect(enableButton()).toBeDefined());

        interestService.getOffer.mockReturnValue(new Promise(() => {}));
        await act(async () => {
            await router.navigate('/interests/offers/offer-2');
        });

        expect(screen.queryByRole('button', {name: 'Enable'})).toBeNull();
        expect(document.querySelector('.interest-offer-skeleton')).not.toBeNull();
        expect(interestService.getOffer).toHaveBeenLastCalledWith('offer-2');
    });
});

describe('InterestOfferScreen accept intent', () => {
    it('focuses Enable without submitting and strips the intent from the url', async () => {
        renderScreen('/interests/offers/offer-1?intent=accept');

        await waitFor(() => expect(document.activeElement).toBe(enableButton()));

        expect(interestService.acceptOffer).not.toHaveBeenCalled();
        await waitFor(() => expect(currentLocation()).toBe('/interests/offers/offer-1'));
    });

    it('does not focus Enable without the intent', async () => {
        renderScreen();

        await waitFor(() => expect(enableButton()).toBeDefined());

        expect(document.activeElement).not.toBe(enableButton());
    });
});

describe('InterestOfferScreen enable', () => {
    it('accepts once with the chosen cadence and goes to the interest settings', async () => {
        let finishAccept;
        interestService.acceptOffer.mockReturnValue(new Promise((resolve) => {
            finishAccept = resolve;
        }));
        renderScreen();
        await waitFor(() => expect(enableButton()).toBeDefined());

        fireEvent.click(screen.getByRole('radio', {name: 'Weekly'}));
        fireEvent.click(enableButton());
        fireEvent.click(enableButton());

        expect(interestService.acceptOffer).toHaveBeenCalledTimes(1);
        expect(interestService.acceptOffer).toHaveBeenCalledWith('offer-1', 'WEEKLY');
        expect(enableButton().disabled).toBe(true);
        expect(screen.getByRole('button', {name: 'Not now'}).disabled).toBe(true);

        finishAccept({id: 'agent-1'});

        await waitFor(() => expect(screen.getByTestId('interest-settings')).toBeDefined());
        expect(toast.success).toHaveBeenCalledWith('You\'ll get news about Formula 1. The first update is on its way.');
    });

    it.each([
        ['OFFER_WITHDRAWN', 410, 'WITHDRAWN', 'This suggestion was withdrawn because the memories behind it were removed.'],
        ['OFFER_EXPIRED', 409, 'EXPIRED', 'This suggestion has expired.'],
        ['OFFER_ALREADY_DECIDED', 409, 'ACCEPTED', 'You\'re following Formula 1.'],
    ])('re-reads the offer after %s', async (code, status, refetchedStatus, message) => {
        interestService.acceptOffer.mockRejectedValue(apiError(status, code));
        renderScreen();
        await waitFor(() => expect(enableButton()).toBeDefined());

        interestService.getOffer.mockResolvedValue(offerWith({status: refetchedStatus}));
        fireEvent.click(enableButton());

        await waitFor(() => expect(screen.getByText(message)).toBeDefined());
        expect(interestService.getOffer).toHaveBeenCalledTimes(2);
    });

    it('shows the expired state after OFFER_EXPIRED even if the re-read still says pending', async () => {
        interestService.acceptOffer.mockRejectedValue(apiError(409, 'OFFER_EXPIRED'));
        renderScreen();
        await waitFor(() => expect(enableButton()).toBeDefined());

        fireEvent.click(enableButton());

        await waitFor(() => expect(screen.getByText('This suggestion has expired.')).toBeDefined());
    });

    it('shows the gone state when the accept answers OFFER_NOT_FOUND', async () => {
        interestService.acceptOffer.mockRejectedValue(apiError(404, 'OFFER_NOT_FOUND'));
        renderScreen();
        await waitFor(() => expect(enableButton()).toBeDefined());

        fireEvent.click(enableButton());

        await waitFor(() => expect(screen.getByText('This suggestion is no longer available.')).toBeDefined());
    });

    it('links to the interest settings when the agent limit is reached', async () => {
        interestService.acceptOffer.mockRejectedValue(apiError(409, 'AGENT_LIMIT_REACHED'));
        renderScreen();
        await waitFor(() => expect(enableButton()).toBeDefined());

        fireEvent.click(enableButton());

        await waitFor(() => expect(document.querySelector('.interest-offer-error')).not.toBeNull());
        expect(document.querySelector('.interest-offer-error').textContent).toContain('You\'re already following as many interests as you can.');
        expect(document.querySelector('.interest-offer-error a').getAttribute('href')).toBe('/settings/interests');
        expect(enableButton().disabled).toBe(false);
    });

    it('says the account cannot use news agents', async () => {
        interestService.acceptOffer.mockRejectedValue(apiError(403, 'NOT_PERMITTED'));
        renderScreen();
        await waitFor(() => expect(enableButton()).toBeDefined());

        fireEvent.click(enableButton());

        await waitFor(() => expect(screen.getByText('Your account can\'t use news agents.')).toBeDefined());
    });

    it('reports any other failure inline', async () => {
        interestService.acceptOffer.mockRejectedValue(apiError(500, undefined));
        renderScreen();
        await waitFor(() => expect(enableButton()).toBeDefined());

        fireEvent.click(enableButton());

        await waitFor(() => expect(screen.getByText('Couldn\'t turn this on. Please try again.')).toBeDefined());
    });
});

describe('InterestOfferScreen not now', () => {
    it('declines and goes home', async () => {
        renderScreen();
        await waitFor(() => expect(enableButton()).toBeDefined());

        fireEvent.click(screen.getByRole('button', {name: 'Not now'}));

        await waitFor(() => expect(screen.getByTestId('home')).toBeDefined());
        expect(interestService.declineOffer).toHaveBeenCalledWith('offer-1');
        expect(interestService.acceptOffer).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith('Okay — I won\'t suggest this again for a while.');
    });

    it('re-reads the offer when it was already decided', async () => {
        interestService.declineOffer.mockRejectedValue(apiError(409, 'OFFER_ALREADY_DECIDED'));
        renderScreen();
        await waitFor(() => expect(enableButton()).toBeDefined());

        interestService.getOffer.mockResolvedValue(offerWith({status: 'DECLINED'}));
        fireEvent.click(screen.getByRole('button', {name: 'Not now'}));

        await waitFor(() => expect(screen.getByText('You turned this suggestion down.')).toBeDefined());
    });

    it('reports a failed decline', async () => {
        interestService.declineOffer.mockRejectedValue(apiError(500, undefined));
        renderScreen();
        await waitFor(() => expect(enableButton()).toBeDefined());

        fireEvent.click(screen.getByRole('button', {name: 'Not now'}));

        await waitFor(() => expect(screen.getByText('Couldn\'t dismiss this suggestion. Please try again.')).toBeDefined());
    });
});
