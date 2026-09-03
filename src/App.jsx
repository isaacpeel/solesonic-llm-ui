import {createBrowserRouter, Navigate, Outlet} from "react-router";
import {RouterProvider} from "react-router/dom";
import './App.css';
import ChatPage from "./chat/ChatScreen.jsx";
import UserSettings from "./user/UserSettings.jsx";
import GeneralUserSettings from "./user/GeneralUserSettings.jsx";
import ConnectionsSettings from "./user/ConnectionsSettings.jsx";
import RagManagement from "./train/RagManagement.jsx";
import {DEFAULT_RAG_LEVEL} from "./train/ragLevels.js";
import GoogleAuthCallback from "./user/GoogleAuthCallback.jsx";
import AtlassianAuthCallback from "./user/AtlassianAuthCallback.jsx";
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
            {
                path: "settings",
                element: <UserSettings />,
                children: [
                    { index: true, element: <Navigate to="general" replace /> },
                    { path: "general", element: <GeneralUserSettings /> },
                    { path: "connections", element: <ConnectionsSettings /> },
                    { path: "rag", element: <Navigate to={DEFAULT_RAG_LEVEL} replace /> },
                    { path: "rag/:level", element: <RagManagement /> },
                ]
            },
            { path: "google/auth/callback", element: <GoogleAuthCallback /> },
            { path: "atlassian/auth/callback", element: <AtlassianAuthCallback /> },
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
