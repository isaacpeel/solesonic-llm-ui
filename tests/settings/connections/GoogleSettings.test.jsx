import {render, waitFor, fireEvent} from '@testing-library/react';
import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('../../../src/service/GoogleAuthService.js', () => ({
    default: {
        authUri: vi.fn(),
        authCallback: vi.fn(),
        profile: vi.fn(),
        revoke: vi.fn(),
    },
}));

vi.mock('../../../src/service/UserPreferencesService.js', () => ({
    default: {
        get: vi.fn(),
        update: vi.fn(),
        save: vi.fn(),
    },
}));

vi.mock('react-toastify', () => ({
    toast: Object.assign(vi.fn(), {error: vi.fn()}),
    ToastContainer: () => null,
    Bounce: {},
}));

vi.mock('loglevel', () => ({
    default: {error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()},
}));

import GoogleSettings from '../../../src/settings/connections/GoogleSettings.jsx';
import googleAuthService from '../../../src/service/GoogleAuthService.js';
import userPreferencesService from '../../../src/service/UserPreferencesService.js';
import {toast} from 'react-toastify';

const gmailProfile = {
    emailAddress: 'someone@example.com',
    messagesTotal: 12043,
    threadsTotal: 8871,
    historyId: '992144',
};

beforeEach(() => {
    vi.clearAllMocks();
    googleAuthService.authUri.mockResolvedValue({uri: 'https://accounts.google.com/o/oauth2/v2/auth'});
    googleAuthService.profile.mockResolvedValue(gmailProfile);
    googleAuthService.revoke.mockResolvedValue(null);
    userPreferencesService.get.mockResolvedValue({googleAuthentication: false});
});

describe('GoogleSettings', () => {
    it('shows a not-connected state for a fresh user and never asks for a profile', async () => {
        const {container} = render(<GoogleSettings/>);

        await waitFor(() => {
            expect(container.querySelector('[data-dialog="Your Google account is not connected"]')).not.toBeNull();
        });

        expect(googleAuthService.profile).not.toHaveBeenCalled();
        expect(container.querySelector('[data-dialog="Disconnect Google Account"]')).toBeNull();
    });

    it('renders the connect action once the auth link loads', async () => {
        const {container} = render(<GoogleSettings/>);

        await waitFor(() => {
            expect(container.querySelector('[data-dialog="Connect Google Account"]')).not.toBeNull();
        });
    });

    it('shows the connected mailbox address when the user is connected', async () => {
        userPreferencesService.get.mockResolvedValue({googleAuthentication: true});

        const {getByText, container} = render(<GoogleSettings/>);

        await waitFor(() => {
            expect(getByText('Connected as someone@example.com')).toBeDefined();
        });

        expect(googleAuthService.profile).toHaveBeenCalledTimes(1);
        expect(container.querySelector('[data-dialog="Your Google account is connected"]')).not.toBeNull();
    });

    it('renders a 400 from the profile call as a reconnect prompt', async () => {
        userPreferencesService.get.mockResolvedValue({googleAuthentication: true});
        const rejection = new Error('400: GET - /google/auth/profile reconnect');
        rejection.status = 400;
        googleAuthService.profile.mockRejectedValue(rejection);

        const {getByText} = render(<GoogleSettings/>);

        await waitFor(() => {
            expect(getByText('Google access is no longer valid. Reconnect your Google account.')).toBeDefined();
        });
    });

    it('renders a non-400 profile failure as a generic message', async () => {
        userPreferencesService.get.mockResolvedValue({googleAuthentication: true});
        const rejection = new Error('503: GET - /google/auth/profile upstream');
        rejection.status = 503;
        googleAuthService.profile.mockRejectedValue(rejection);

        const {getByText} = render(<GoogleSettings/>);

        await waitFor(() => {
            expect(getByText('Could not read your Google profile right now.')).toBeDefined();
        });
    });

    it('confirms before disconnecting and does not revoke until confirmed', async () => {
        userPreferencesService.get.mockResolvedValue({googleAuthentication: true});

        const {container, getByText} = render(<GoogleSettings/>);

        await waitFor(() => {
            expect(container.querySelector('[data-dialog="Disconnect Google Account"]')).not.toBeNull();
        });

        fireEvent.click(container.querySelector('[data-dialog="Disconnect Google Account"]'));

        expect(container.querySelector('.google-settings-confirm')).not.toBeNull();
        expect(googleAuthService.revoke).not.toHaveBeenCalled();

        fireEvent.click(getByText('Cancel'));

        expect(container.querySelector('.google-settings-confirm')).toBeNull();
        expect(googleAuthService.revoke).not.toHaveBeenCalled();
    });

    it('revokes, re-reads preferences, and flips to not-connected on disconnect', async () => {
        userPreferencesService.get.mockResolvedValue({googleAuthentication: true});

        const {container, getByText} = render(<GoogleSettings/>);

        await waitFor(() => {
            expect(container.querySelector('[data-dialog="Disconnect Google Account"]')).not.toBeNull();
        });

        userPreferencesService.get.mockResolvedValue({googleAuthentication: false});

        fireEvent.click(container.querySelector('[data-dialog="Disconnect Google Account"]'));
        fireEvent.click(getByText('Disconnect'));

        await waitFor(() => {
            expect(container.querySelector('[data-dialog="Your Google account is not connected"]')).not.toBeNull();
        });

        expect(googleAuthService.revoke).toHaveBeenCalledTimes(1);
        expect(userPreferencesService.get).toHaveBeenCalledTimes(2);
        expect(toast).toHaveBeenCalledWith('Google account disconnected');
        expect(container.querySelector('.google-settings-confirm')).toBeNull();
    });

    it('keeps the connection visible and toasts when revoke fails', async () => {
        userPreferencesService.get.mockResolvedValue({googleAuthentication: true});
        googleAuthService.revoke.mockRejectedValue(new Error('boom'));

        const {container, getByText} = render(<GoogleSettings/>);

        await waitFor(() => {
            expect(container.querySelector('[data-dialog="Disconnect Google Account"]')).not.toBeNull();
        });

        fireEvent.click(container.querySelector('[data-dialog="Disconnect Google Account"]'));
        fireEvent.click(getByText('Disconnect'));

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Could not disconnect your Google account. Please try again.');
        });

        expect(container.querySelector('[data-dialog="Your Google account is connected"]')).not.toBeNull();
    });
});
