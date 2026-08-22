import {createBrowserRouter, Outlet} from "react-router";
import {RouterProvider} from "react-router/dom";
import './App.css';
import ChatPage from "./chat/ChatScreen.jsx";
import UserSettings from "./user/UserSettings.jsx";
import GoogleAuthCallback from "./user/GoogleAuthCallback.jsx";
import Header from "./common/Header.jsx";
import {SharedDataProvider} from "./context/SharedDataContext.jsx";
import AuthenticationWrapper from "./authorizer/AuthenticationWrapper.jsx";

const Layout = () => (
    <div>
        <Header />
        <div className="app-layout-content">
            <Outlet />
        </div>
    </div>
);

const router = createBrowserRouter([
    {
        path: "/",
        element: <Layout />,
        children: [
            { index: true, element: <ChatPage /> },
            { path: "settings", element: <UserSettings /> },
            { path: "google/auth/callback", element: <GoogleAuthCallback /> },
        ]
    }
]);

const App = () => {
    return (
        <AuthenticationWrapper>
            <SharedDataProvider>
                <RouterProvider router={router} />
            </SharedDataProvider>
        </AuthenticationWrapper>
    );
};
export default App;
