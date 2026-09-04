import {createBrowserRouter, Navigate, Outlet} from "react-router";
import {RouterProvider} from "react-router/dom";
import './App.css';
import ChatPage from "./chat/ChatScreen.jsx";
import UserSettings from "./settings/UserSettings.jsx";
import GeneralUserSettings from "./settings/GeneralUserSettings.jsx";
import ConnectionsSettings from "./settings/connections/ConnectionsSettings.jsx";
import RagManagement from "./settings/rag/RagManagement.jsx";
import {DEFAULT_RAG_LEVEL} from "./settings/rag/ragLevels.js";
import GoogleAuthCallback from "./settings/connections/GoogleAuthCallback.jsx";
import AtlassianAuthCallback from "./settings/connections/AtlassianAuthCallback.jsx";
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
