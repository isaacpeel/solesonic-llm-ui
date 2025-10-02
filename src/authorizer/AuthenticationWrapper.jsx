import {useEffect, useState} from "react";
import {useKeycloak} from "../providers/KeycloakProvider.jsx";
import authService from "../service/AuthService.js";
import PropTypes from "prop-types";

const AuthenticationWrapper = ({children}) => {
    const {keycloak, authenticated, loading} = useKeycloak();
    const [isBlocked, setIsBlocked] = useState(authService.isBlocked());
    const [remainingTime, setRemainingTime] = useState(authService.remainingBlockTime());

    // Set the Keycloak instance in authService when available
    useEffect(() => {
        if (keycloak) {
            authService.setKeycloakInstance(keycloak);
        }
    }, [keycloak]);

    // Handle authentication errors (if needed)
    useEffect(() => {
        if (keycloak && keycloak.error) {
            authService.authFailure(keycloak.error).then(() => {
                setIsBlocked(authService.isBlocked());
            });
        }
    }, [keycloak]);

    // Handle block timer
    useEffect(() => {
        if (isBlocked) {
            const interval = setInterval(() => {
                const timeLeft = authService.remainingBlockTime();
                setRemainingTime(timeLeft);
                if (timeLeft <= 0) {
                    setIsBlocked(false); // Unblock user after time expires
                    clearInterval(interval);
                }
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [isBlocked]);

    // Show loading state while Keycloak initializes
    if (loading) {
        return (
            <div style={{textAlign: "center", marginTop: "20%"}}>
                <h1>Loading...</h1>
                <p>Initializing authentication...</p>
            </div>
        );
    }

    // Show blocked state
    if (isBlocked) {
        return (
            <div style={{textAlign: "center", marginTop: "20%"}}>
                <h1>Account Locked</h1>
                <p>Locked out for {Math.ceil(remainingTime / 1000)} seconds.</p>
            </div>
        );
    }

    // If not authenticated after loading completes, onLoad: 'login-required' 
    // should have already redirected to Keycloak. This branch should rarely appear.
    if (!authenticated) {
        return (
            <div style={{textAlign: "center", marginTop: "20%"}}>
                <h1>Authentication Required</h1>
                <p>Redirecting to login...</p>
            </div>
        );
    }

    // User is authenticated, render children
    return <>{children}</>;
};

AuthenticationWrapper.propTypes = {
    children: PropTypes.node.isRequired,
}

export default AuthenticationWrapper;
