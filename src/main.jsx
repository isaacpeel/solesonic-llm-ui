import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {Amplify} from 'aws-amplify';
import {Authenticator} from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import './main.css';
import amplifyConfig from "./aws-exports";

Amplify.configure(amplifyConfig);

createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <Authenticator.Provider>
            <App/>
        </Authenticator.Provider>
    </React.StrictMode>
);
