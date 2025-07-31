import {useAuthenticator, Authenticator} from "@aws-amplify/ui-react";
import {useEffect, useState} from "react";
import authService from "../service/AuthService.js";
import components from "../authorizer/AuthComponents.jsx";
import PropTypes from "prop-types";

const AuthenticationWrapper = ({children}) => {
    const {error} = useAuthenticator(context => [context.authStatus, context.error]);
    const [isBlocked, setIsBlocked] = useState(authService.isBlocked());
    const [remainingTime, setRemainingTime] = useState(authService.remainingBlockTime());

    useEffect(() => {
        if (error) {
            authService.authFailure(error).then(() => {
                setIsBlocked(authService.isBlocked());
            });
        }
    }, [error]);

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

    if (isBlocked) {
        return (
            <div style={{textAlign: "center", marginTop: "20%"}}>
                <h1>Account Locked</h1>
                <p>Locked out for {Math.ceil(remainingTime / 1000)} seconds.</p>
            </div>
        );
    }

    return <Authenticator
        className="auth-wrapper"
        hideSignUp
        components={components}
    >
        <>{children}</>
    </Authenticator>
};

AuthenticationWrapper.propTypes = {
    children: PropTypes.node.isRequired,
}

export default AuthenticationWrapper;
