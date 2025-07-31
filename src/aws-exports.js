// noinspection SpellCheckingInspection
const amplifyConfig = {
    Auth: {
        Cognito: {
            userPoolId: import.meta.env.VITE_USER_POOL_ID,
            userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
            loginWith: {
                oauth: {
                    domain: import.meta.env.VITE_DOMAIN,
                    scopes: ['openid email phone profile aws.cognito.signin.user.admin '],
                    redirectSignIn: import.meta.env.VITE_REDIRECT_SIGN_IN,
                    redirectSignOut: import.meta.env.VITE_REDIRECT_SIGN_OUT,
                    responseType: 'code',
                },
                username: 'true',
                email: 'false',
                phone: 'false',
            }
        }
    }
};

export default amplifyConfig;
