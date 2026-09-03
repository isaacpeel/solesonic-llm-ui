import {useKeycloak} from '../providers/KeycloakProvider.jsx';
import './GeneralUserSettings.css';

const initialsFor = (user) => {
    const firstInitial = user?.given_name?.[0] ?? '';
    const lastInitial = user?.family_name?.[0] ?? '';

    if (firstInitial || lastInitial) {
        return `${firstInitial}${lastInitial}`.toUpperCase();
    }

    return (user?.preferred_username?.[0] ?? '?').toUpperCase();
};

const GeneralUserSettings = () => {
    const {user} = useKeycloak();

    const profileRows = [
        {label: 'First name', value: user?.given_name},
        {label: 'Last name', value: user?.family_name},
        {label: 'Username', value: user?.preferred_username},
        {label: 'Email', value: user?.email},
        {label: 'Location', value: user?.location}
    ].filter((profileRow) => profileRow.value);

    const roles = user?.roles ?? [];

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
        </div>
    );
};

export default GeneralUserSettings;
