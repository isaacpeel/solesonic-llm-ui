import {useCallback, useEffect, useState} from 'react';
import {toast} from 'react-toastify';
import log from 'loglevel';
import {useKeycloak} from '../providers/KeycloakProvider.jsx';
import addressService from '../service/AddressService.js';
import userPreferencesService from '../service/UserPreferencesService.js';
import './GeneralUserSettings.css';

const initialsFor = (user) => {
    const firstInitial = user?.given_name?.[0] ?? '';
    const lastInitial = user?.family_name?.[0] ?? '';

    if (firstInitial || lastInitial) {
        return `${firstInitial}${lastInitial}`.toUpperCase();
    }

    return (user?.preferred_username?.[0] ?? '?').toUpperCase();
};

const emptyAddressForm = {
    address: '',
    city: '',
    state: '',
    zip: '',
};

const addressFieldsFrom = (source) => ({
    address: source?.address ?? '',
    city: source?.city ?? '',
    state: source?.state ?? '',
    zip: source?.zip ?? '',
});

const timezoneOptions = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : [Intl.DateTimeFormat().resolvedOptions().timeZone];

const usStateOptions = [
    {code: 'AL', name: 'Alabama'},
    {code: 'AK', name: 'Alaska'},
    {code: 'AZ', name: 'Arizona'},
    {code: 'AR', name: 'Arkansas'},
    {code: 'CA', name: 'California'},
    {code: 'CO', name: 'Colorado'},
    {code: 'CT', name: 'Connecticut'},
    {code: 'DE', name: 'Delaware'},
    {code: 'DC', name: 'District of Columbia'},
    {code: 'FL', name: 'Florida'},
    {code: 'GA', name: 'Georgia'},
    {code: 'HI', name: 'Hawaii'},
    {code: 'ID', name: 'Idaho'},
    {code: 'IL', name: 'Illinois'},
    {code: 'IN', name: 'Indiana'},
    {code: 'IA', name: 'Iowa'},
    {code: 'KS', name: 'Kansas'},
    {code: 'KY', name: 'Kentucky'},
    {code: 'LA', name: 'Louisiana'},
    {code: 'ME', name: 'Maine'},
    {code: 'MD', name: 'Maryland'},
    {code: 'MA', name: 'Massachusetts'},
    {code: 'MI', name: 'Michigan'},
    {code: 'MN', name: 'Minnesota'},
    {code: 'MS', name: 'Mississippi'},
    {code: 'MO', name: 'Missouri'},
    {code: 'MT', name: 'Montana'},
    {code: 'NE', name: 'Nebraska'},
    {code: 'NV', name: 'Nevada'},
    {code: 'NH', name: 'New Hampshire'},
    {code: 'NJ', name: 'New Jersey'},
    {code: 'NM', name: 'New Mexico'},
    {code: 'NY', name: 'New York'},
    {code: 'NC', name: 'North Carolina'},
    {code: 'ND', name: 'North Dakota'},
    {code: 'OH', name: 'Ohio'},
    {code: 'OK', name: 'Oklahoma'},
    {code: 'OR', name: 'Oregon'},
    {code: 'PA', name: 'Pennsylvania'},
    {code: 'RI', name: 'Rhode Island'},
    {code: 'SC', name: 'South Carolina'},
    {code: 'SD', name: 'South Dakota'},
    {code: 'TN', name: 'Tennessee'},
    {code: 'TX', name: 'Texas'},
    {code: 'UT', name: 'Utah'},
    {code: 'VT', name: 'Vermont'},
    {code: 'VA', name: 'Virginia'},
    {code: 'WA', name: 'Washington'},
    {code: 'WV', name: 'West Virginia'},
    {code: 'WI', name: 'Wisconsin'},
    {code: 'WY', name: 'Wyoming'},
];

const GeneralUserSettings = () => {
    const {user} = useKeycloak();

    const fullName = [user?.given_name, user?.family_name].filter(Boolean).join(' ');

    const profileRows = [
        {label: 'Name', value: fullName},
        {label: 'Username', value: user?.preferred_username},
        {label: 'Email', value: user?.email},
        {label: 'Location', value: user?.location}
    ].filter((profileRow) => profileRow.value);

    const roles = user?.roles ?? [];

    const [addressId, setAddressId] = useState(null);
    const [addressForm, setAddressForm] = useState(emptyAddressForm);
    const [isSavingAddress, setIsSavingAddress] = useState(false);

    const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const [timezone, setTimezone] = useState(defaultTimezone);
    const [isSavingTimezone, setIsSavingTimezone] = useState(false);

    const loadPreferences = useCallback(async () => {
        try {
            const userPreferences = await userPreferencesService.get();

            if (userPreferences?.timezone) {
                setTimezone(userPreferences.timezone);
            }

            if (!userPreferences?.addressId) {
                setAddressId(null);
                setAddressForm(emptyAddressForm);
                return;
            }

            const loadedAddress = await addressService.get(userPreferences.addressId);
            setAddressId(userPreferences.addressId);
            setAddressForm(addressFieldsFrom(loadedAddress));
        } catch (caughtError) {
            log.error('[GeneralUserSettings] Failed to load preferences:', caughtError);
            setAddressId(null);
            setAddressForm(emptyAddressForm);
        }
    }, []);

    useEffect(() => {
        void loadPreferences();
    }, [loadPreferences]);

    const handleTimezoneChange = async (event) => {
        const nextTimezone = event.target.value;
        const previousTimezone = timezone;

        setTimezone(nextTimezone);
        setIsSavingTimezone(true);

        try {
            await userPreferencesService.patch({timezone: nextTimezone});
            toast('Timezone updated');
        } catch (caughtError) {
            log.error('[GeneralUserSettings] Failed to save timezone:', caughtError);
            toast.error('Could not save your timezone. Please try again.');
            setTimezone(previousTimezone);
        } finally {
            setIsSavingTimezone(false);
        }
    };

    const handleAddressFieldChange = (field) => (event) => {
        setAddressForm((previousForm) => ({...previousForm, [field]: event.target.value}));
    };

    const handleSaveAddress = async () => {
        setIsSavingAddress(true);

        try {
            if (addressId) {
                const updatedAddress = await addressService.update(addressId, addressForm);
                setAddressForm(addressFieldsFrom(updatedAddress));
            } else {
                const createdAddress = await addressService.create(addressForm);
                await userPreferencesService.linkAddress(createdAddress.id);
                setAddressId(createdAddress.id);
                setAddressForm(addressFieldsFrom(createdAddress));
            }

            toast('Address saved');
        } catch (caughtError) {
            log.error('[GeneralUserSettings] Failed to save address:', caughtError);
            toast.error('Could not save your address. Please try again.');
        } finally {
            setIsSavingAddress(false);
        }
    };

    return (
        <div className="general-settings-container">
            <h2>General</h2>
            <p className="settings-content-subtitle">
                Read-only profile information from your identity provider.
            </p>

            <div className="general-settings-profile-header">
                <div className="general-settings-avatar">{initialsFor(user)}</div>
                <div>
                    <div className="general-settings-profile-name">
                        {user?.name ?? user?.preferred_username ?? 'Unknown user'}
                    </div>
                    {user?.preferred_username && (
                        <div className="general-settings-profile-username">@{user.preferred_username}</div>
                    )}
                </div>
            </div>

            <div className="general-settings-profile-grid">
                {profileRows.map((profileRow) => (
                    <div className="general-settings-profile-row" key={profileRow.label}>
                        <div className="general-settings-profile-label">{profileRow.label}</div>
                        <div className="general-settings-profile-value">{profileRow.value}</div>
                    </div>
                ))}

                <div className="general-settings-profile-row">
                    <div className="general-settings-profile-label">Roles</div>
                    <div className="general-settings-profile-value general-settings-role-chips">
                        {roles.length > 0 ? (
                            roles.map((role) => (
                                <span className="general-settings-role-chip" key={role}>{role}</span>
                            ))
                        ) : (
                            <span className="general-settings-no-roles">No roles assigned</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="general-settings-address-form">
                <label className="general-settings-address-field">
                    <span className="general-settings-profile-label">Address</span>
                    <input
                        type="text"
                        value={addressForm.address}
                        onChange={handleAddressFieldChange('address')}
                        disabled={isSavingAddress}
                    />
                </label>
                <label className="general-settings-address-field">
                    <span className="general-settings-profile-label">City</span>
                    <input
                        type="text"
                        value={addressForm.city}
                        onChange={handleAddressFieldChange('city')}
                        disabled={isSavingAddress}
                    />
                </label>
                <label className="general-settings-address-field">
                    <span className="general-settings-profile-label">State</span>
                    <select
                        value={addressForm.state}
                        onChange={handleAddressFieldChange('state')}
                        disabled={isSavingAddress}
                    >
                        <option value="">Select a state</option>
                        {usStateOptions.map((usStateOption) => (
                            <option key={usStateOption.code} value={usStateOption.code}>
                                {usStateOption.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="general-settings-address-field">
                    <span className="general-settings-profile-label">Zip</span>
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={addressForm.zip}
                        onChange={handleAddressFieldChange('zip')}
                        disabled={isSavingAddress}
                    />
                </label>

                    <div className="general-settings-profile-label">Timezone</div>
                    <div className="general-settings-profile-value">
                        <select
                            className="general-settings-timezone-select"
                            value={timezone}
                            onChange={handleTimezoneChange}
                            disabled={isSavingTimezone}
                        >
                            {timezoneOptions.map((timezoneOption) => (
                                <option key={timezoneOption} value={timezoneOption}>
                                    {timezoneOption}
                                </option>
                            ))}
                        </select>
                    </div>

                <div className="general-settings-address-actions">
                    <button
                        type="button"
                        className="general-settings-save-button"
                        onClick={handleSaveAddress}
                        disabled={isSavingAddress}
                    >
                        {isSavingAddress ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GeneralUserSettings;
