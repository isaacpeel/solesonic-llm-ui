import {render, screen, waitFor, fireEvent, within} from '@testing-library/react';
import {describe, it, vi, expect, beforeEach} from 'vitest';

vi.mock('../../../src/service/PushSubscriptionService.js', () => ({
    default: {
        isSupported: vi.fn(),
        permissionState: vi.fn(),
        fetchPublicKey: vi.fn(),
        hasActiveSubscription: vi.fn(),
        whenSynced: vi.fn(),
        deviceSubscriptionId: vi.fn(),
        enableOnThisDevice: vi.fn(),
        disableOnThisDevice: vi.fn(),
        sendTest: vi.fn(),
        listSubscriptions: vi.fn(),
        deleteSubscription: vi.fn(),
        getPreferences: vi.fn(),
        updatePreferences: vi.fn(),
    },
    PUSH_DISABLED_CODE: 'PUSH_DISABLED',
    UNSUPPORTED_BROWSER_CODE: 'UNSUPPORTED_BROWSER',
    DELIVERY_FAILED_CODE: 'DELIVERY_FAILED',
}));

vi.mock('react-toastify', () => ({
    toast: {success: vi.fn(), error: vi.fn(), info: vi.fn()},
}));

import NotificationSettings from '../../../src/settings/notifications/NotificationSettings.jsx';
import pushSubscriptionService from '../../../src/service/PushSubscriptionService.js';
import {toast} from 'react-toastify';

const THIS_DEVICE = {id: 'subscription-1', label: 'Chrome on Android', lastDelivered: null};
const OTHER_DEVICE = {id: 'subscription-2', label: 'Chrome on Windows', lastDelivered: '2026-10-19T12:00:00Z'};

const codedError = (code) => Object.assign(new Error(code), {code});

const deviceCard = () => document.querySelector('.notification-device-card');

const deviceRowFor = (label) => screen.getByText(label).closest('.notification-device-row');

async function renderSettingsInState(stateName) {
    render(<NotificationSettings/>);

    await waitFor(() => {
        expect(deviceCard().classList.contains(`notification-device-state-${stateName}`)).toBe(true);
    });
}

beforeEach(() => {
    vi.clearAllMocks();

    pushSubscriptionService.whenSynced.mockResolvedValue(undefined);
    pushSubscriptionService.isSupported.mockReturnValue(true);
    pushSubscriptionService.permissionState.mockReturnValue('granted');
    pushSubscriptionService.fetchPublicKey.mockResolvedValue('server-key');
    pushSubscriptionService.hasActiveSubscription.mockResolvedValue(true);
    pushSubscriptionService.deviceSubscriptionId.mockReturnValue('subscription-1');
    pushSubscriptionService.listSubscriptions.mockResolvedValue([THIS_DEVICE, OTHER_DEVICE]);
    pushSubscriptionService.getPreferences.mockResolvedValue({turnComplete: true, elicitation: true});
    pushSubscriptionService.updatePreferences.mockImplementation(async (preferences) => preferences);
    pushSubscriptionService.enableOnThisDevice.mockResolvedValue({permission: 'granted', subscription: THIS_DEVICE});
    pushSubscriptionService.disableOnThisDevice.mockResolvedValue(undefined);
    pushSubscriptionService.sendTest.mockResolvedValue({reRegistered: false, subscription: null});
    pushSubscriptionService.deleteSubscription.mockResolvedValue(null);
});

describe('NotificationSettings device card', () => {
    it('shows a spinner while checking', () => {
        pushSubscriptionService.fetchPublicKey.mockReturnValue(new Promise(() => {}));

        render(<NotificationSettings/>);

        expect(deviceCard().classList.contains('notification-device-state-checking')).toBe(true);
        expect(deviceCard().querySelector('.notification-spinner')).not.toBeNull();
    });

    it('hides the whole page when the server has push disabled', async () => {
        pushSubscriptionService.fetchPublicKey.mockResolvedValue(null);

        await renderSettingsInState('serverDisabled');

        expect(screen.getByText("Notifications aren't available on this server.")).toBeDefined();
        expect(document.querySelector('.notification-preferences')).toBeNull();
        expect(document.querySelector('.notification-devices')).toBeNull();
    });

    it('says the browser cannot receive notifications', async () => {
        pushSubscriptionService.isSupported.mockReturnValue(false);

        await renderSettingsInState('unsupported');

        expect(screen.getByText("This browser can't receive notifications. Use Chrome.")).toBeDefined();
    });

    it('explains how to re-allow a denied permission', async () => {
        pushSubscriptionService.permissionState.mockReturnValue('denied');

        await renderSettingsInState('denied');

        expect(deviceCard().textContent).toContain('Site settings');
        expect(deviceCard().textContent).toContain('Settings → Apps → Chrome → Notifications');
        expect(screen.queryByRole('button', {name: 'Turn on for this device'})).toBeNull();
    });

    it('offers to turn on when permission was never asked', async () => {
        pushSubscriptionService.permissionState.mockReturnValue('default');

        await renderSettingsInState('off');

        expect(screen.getByRole('button', {name: 'Turn on for this device'})).toBeDefined();
    });

    it('offers to turn on when permission is granted but nothing is subscribed', async () => {
        pushSubscriptionService.hasActiveSubscription.mockResolvedValue(false);

        await renderSettingsInState('off');
    });

    it('shows on with test and turn-off actions', async () => {
        await renderSettingsInState('on');

        expect(screen.getByText('On for this device')).toBeDefined();
        expect(screen.getByRole('button', {name: 'Send test'})).toBeDefined();
        expect(screen.getByRole('button', {name: 'Turn off for this device'})).toBeDefined();
    });
});

describe('NotificationSettings device actions', () => {
    it('turns on from the button', async () => {
        pushSubscriptionService.permissionState.mockReturnValue('default');
        await renderSettingsInState('off');

        fireEvent.click(screen.getByRole('button', {name: 'Turn on for this device'}));

        await waitFor(() => expect(deviceCard().classList.contains('notification-device-state-on')).toBe(true));
        expect(pushSubscriptionService.enableOnThisDevice).toHaveBeenCalledTimes(1);
    });

    it('moves to denied when the prompt is refused', async () => {
        pushSubscriptionService.permissionState.mockReturnValue('default');
        pushSubscriptionService.enableOnThisDevice.mockResolvedValue({permission: 'denied', subscription: null});
        await renderSettingsInState('off');

        fireEvent.click(screen.getByRole('button', {name: 'Turn on for this device'}));

        await waitFor(() => expect(deviceCard().classList.contains('notification-device-state-denied')).toBe(true));
    });

    it('says Chrome only when the server rejects the browser', async () => {
        pushSubscriptionService.permissionState.mockReturnValue('default');
        pushSubscriptionService.enableOnThisDevice.mockRejectedValue(codedError('UNSUPPORTED_BROWSER'));
        await renderSettingsInState('off');

        fireEvent.click(screen.getByRole('button', {name: 'Turn on for this device'}));

        await waitFor(() => expect(deviceCard().classList.contains('notification-device-state-unsupportedBrowser')).toBe(true));
        expect(screen.getByText('Notifications are supported in Chrome only.')).toBeDefined();
    });

    it('sends a test to this device', async () => {
        await renderSettingsInState('on');

        fireEvent.click(screen.getByRole('button', {name: 'Send test'}));

        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(pushSubscriptionService.sendTest).toHaveBeenCalledWith('subscription-1');
    });

    it('reports a re-registration after a test', async () => {
        pushSubscriptionService.sendTest.mockResolvedValue({reRegistered: true, subscription: {id: 'subscription-3'}});
        await renderSettingsInState('on');

        fireEvent.click(screen.getByRole('button', {name: 'Send test'}));

        await waitFor(() => expect(toast.info).toHaveBeenCalled());
        expect(pushSubscriptionService.listSubscriptions).toHaveBeenCalledTimes(2);
    });

    it('turns off for this device', async () => {
        await renderSettingsInState('on');

        fireEvent.click(screen.getByRole('button', {name: 'Turn off for this device'}));

        await waitFor(() => expect(deviceCard().classList.contains('notification-device-state-off')).toBe(true));
        expect(pushSubscriptionService.disableOnThisDevice).toHaveBeenCalledTimes(1);
    });
});

describe('NotificationSettings preferences', () => {
    it('writes both fields when one toggle changes', async () => {
        await renderSettingsInState('on');
        await waitFor(() => expect(screen.getByLabelText('A reply is ready').checked).toBe(true));

        fireEvent.click(screen.getByLabelText('A reply is ready'));

        expect(screen.getByLabelText('A reply is ready').checked).toBe(false);
        await waitFor(() => {
            expect(pushSubscriptionService.updatePreferences).toHaveBeenCalledWith({turnComplete: false, elicitation: true});
        });
    });

    it('locks the toggles until the save settles', async () => {
        let finishSave;
        pushSubscriptionService.updatePreferences.mockReturnValue(new Promise((resolve) => {
            finishSave = resolve;
        }));
        await renderSettingsInState('on');
        await waitFor(() => expect(screen.getByLabelText('A reply is ready').checked).toBe(true));

        fireEvent.click(screen.getByLabelText('A reply is ready'));

        expect(screen.getByLabelText('A tool needs my answer').disabled).toBe(true);

        finishSave({turnComplete: false, elicitation: true});

        await waitFor(() => expect(screen.getByLabelText('A tool needs my answer').disabled).toBe(false));
    });

    it('reverts the toggle and reports a failed save', async () => {
        pushSubscriptionService.updatePreferences.mockRejectedValue(new Error('network down'));
        await renderSettingsInState('on');
        await waitFor(() => expect(screen.getByLabelText('A tool needs my answer').checked).toBe(true));

        fireEvent.click(screen.getByLabelText('A tool needs my answer'));

        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(screen.getByLabelText('A tool needs my answer').checked).toBe(true);
    });
});

describe('NotificationSettings device id after a silent re-subscribe', () => {
    it('waits for the sync in flight before reading this device id', async () => {
        let finishSync;
        pushSubscriptionService.whenSynced.mockReturnValue(new Promise((resolve) => {
            finishSync = resolve;
        }));
        pushSubscriptionService.deviceSubscriptionId.mockReturnValue(null);

        render(<NotificationSettings/>);

        expect(pushSubscriptionService.fetchPublicKey).not.toHaveBeenCalled();

        pushSubscriptionService.deviceSubscriptionId.mockReturnValue('subscription-1');
        finishSync();

        await waitFor(() => expect(screen.getByRole('button', {name: 'Send test'}).disabled).toBe(false));
    });
});

describe('NotificationSettings devices', () => {
    it('marks this device and shows when each was last notified', async () => {
        await renderSettingsInState('on');
        await waitFor(() => expect(deviceRowFor('Chrome on Android')).not.toBeNull());

        expect(deviceRowFor('Chrome on Android').querySelector('.notification-device-this-device')).not.toBeNull();
        expect(deviceRowFor('Chrome on Windows').querySelector('.notification-device-this-device')).toBeNull();
        expect(within(deviceRowFor('Chrome on Android')).getByText(/never/)).toBeDefined();
    });

    it('turns this device off when its row is removed', async () => {
        await renderSettingsInState('on');
        await waitFor(() => expect(deviceRowFor('Chrome on Android')).not.toBeNull());

        fireEvent.click(within(deviceRowFor('Chrome on Android')).getByRole('button', {name: 'Remove Chrome on Android'}));

        await waitFor(() => expect(deviceCard().classList.contains('notification-device-state-off')).toBe(true));
        expect(pushSubscriptionService.disableOnThisDevice).toHaveBeenCalledTimes(1);
        expect(pushSubscriptionService.deleteSubscription).not.toHaveBeenCalled();
        expect(screen.queryByText('Chrome on Android')).toBeNull();
    });

    it('deletes another device by id', async () => {
        await renderSettingsInState('on');
        await waitFor(() => expect(deviceRowFor('Chrome on Windows')).not.toBeNull());

        fireEvent.click(within(deviceRowFor('Chrome on Windows')).getByRole('button', {name: 'Remove Chrome on Windows'}));

        await waitFor(() => expect(screen.queryByText('Chrome on Windows')).toBeNull());
        expect(pushSubscriptionService.deleteSubscription).toHaveBeenCalledWith('subscription-2');
        expect(pushSubscriptionService.disableOnThisDevice).not.toHaveBeenCalled();
    });
});
