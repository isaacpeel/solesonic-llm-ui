import {NavLink, Outlet} from "react-router";
import {
    ChevronLeftIcon,
    UserCircleIcon,
    BellIcon,
    ArrowsRightLeftIcon,
    CubeTransparentIcon,
    LightBulbIcon,
    NewspaperIcon,
    PhotoIcon,
    KeyIcon
} from "@heroicons/react/24/solid";
import {useSharedData} from "../context/useSharedData.jsx";
import {useKeycloak} from "../providers/KeycloakProvider.jsx";
import {ROLES} from "../authorizer/roles.js";

import "./UserSettings.css";

const SETTINGS_NAV_GROUPS = [
    {
        label: "Account",
        items: [
            {to: "/settings/general", label: "General", Icon: UserCircleIcon},
            {to: "/settings/notifications", label: "Notifications", Icon: BellIcon}
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
            {to: "/settings/rag", label: "RAG", Icon: CubeTransparentIcon},
            {to: "/settings/images", label: "Images", Icon: PhotoIcon},
            {to: "/settings/memory", label: "Memory", Icon: LightBulbIcon},
            {to: "/settings/interests", label: "Interests", Icon: NewspaperIcon}
        ]
    },
    {
        label: "Administration",
        items: [
            {to: "/settings/model-access", label: "Model Access", Icon: KeyIcon, requiresRole: ROLES.LLM_KEY_ADMIN}
        ]
    }
];

const visibleNavGroups = (hasRole) => SETTINGS_NAV_GROUPS
    .map((navGroup) => ({
        ...navGroup,
        items: navGroup.items.filter((item) => !item.requiresRole || hasRole(item.requiresRole))
    }))
    .filter((navGroup) => navGroup.items.length > 0);

const UserSettings = () => {
    const {chatId} = useSharedData();
    const {hasRole} = useKeycloak();

    return (
        <div className="settings-page">
            <div className="settings-scroll">
                <NavLink to={chatId ? `/chat/${chatId}` : "/"} className="settings-back-link">
                    <ChevronLeftIcon className="settings-back-icon"/>
                    Back to Chat
                </NavLink>

                <h1 className="settings-page-title">Settings</h1>
                <p className="settings-page-subtitle">Manage your account, connections, and data.</p>

                <div className="settings-layout">
                    <nav className="settings-nav" aria-label="Settings">
                        {visibleNavGroups(hasRole).map((navGroup) => (
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
