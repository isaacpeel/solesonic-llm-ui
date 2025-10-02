import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {KeycloakProvider} from './providers/KeycloakProvider.jsx';
import {ToastContainer} from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './main.css';

createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <KeycloakProvider>
            <App/>
            <ToastContainer
                position="top-right"
                autoClose={5000}
                hideProgressBar={false}
                newestOnTop={false}
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
            />
        </KeycloakProvider>
    </React.StrictMode>
);
