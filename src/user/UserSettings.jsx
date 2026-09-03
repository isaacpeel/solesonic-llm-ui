import {NavLink, Outlet} from "react-router";
import {ChevronLeftIcon, UserCircleIcon, ArrowsRightLeftIcon, CubeTransparentIcon} from "@heroicons/react/24/solid";

import "./UserSettings.css";

const SETTINGS_NAV_GROUPS = [
    {
        label: "Account",
        items: [
            {to: "/settings/general", label: "General", Icon: UserCircleIcon}
        ]
    },
    {
        label: "Connections",
        items: [
            {to: "/settings/connections", label: "Connections", Icon: ArrowsRightLeftIcon}
        ]
    },
    {
        label: "Data",
        items: [
            {to: "/settings/rag", label: "RAG", Icon: CubeTransparentIcon}
        ]
    }
];

const UserSettings = () => {
    return (
        <div className="settings-page">
            <div className="settings-scroll">
                <NavLink to="/" className="settings-back-link">
                    <ChevronLeftIcon className="settings-back-icon"/>
                    Back to Chat
                </NavLink>

                <h1 className="settings-page-title">Settings</h1>
                <p className="settings-page-subtitle">Manage your account, connections, and data.</p>

                <div className="settings-layout">
                    <nav className="settings-nav" aria-label="Settings">
                        {SETTINGS_NAV_GROUPS.map((navGroup) => (
                            <div className="settings-nav-group" key={navGroup.label}>
                                <div className="settings-nav-group-label">{navGroup.label}</div>
                                {navGroup.items.map(({to, label, Icon}) => (
                                    <NavLink
                                        key={to}
                                        to={to}
                                        className={({isActive}) => `settings-nav-row ${isActive ? "selected" : ""}`}
                                    >
                                        <Icon className="settings-nav-icon"/>
                                        <span className="settings-nav-label">{label}</span>
                                    </NavLink>
                                ))}
                            </div>
                        ))}
                    </nav>

                    <section className="settings-content">
                        <Outlet/>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default UserSettings;
