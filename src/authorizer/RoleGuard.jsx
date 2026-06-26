import { useKeycloak } from '../providers/KeycloakProvider.jsx';

const RoleGuard = ({ role, fallback = null, children }) => {
    const { hasRole } = useKeycloak();
    return hasRole(role) ? children : fallback;
};

export default RoleGuard;
