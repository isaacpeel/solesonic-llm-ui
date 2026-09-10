import {createBrowserRouter, Navigate, Outlet} from "react-router";
import {RouterProvider} from "react-router/dom";
import './App.css';
import ChatPage from "./chat/ChatScreen.jsx";
import UserSettings from "./settings/UserSettings.jsx";
import GeneralUserSettings from "./settings/GeneralUserSettings.jsx";
import ConnectionsSettings from "./settings/connections/ConnectionsSettings.jsx";
import RagManagement from "./settings/rag/RagManagement.jsx";
import {DEFAULT_RAG_LEVEL} from "./settings/rag/ragLevels.js";
import GeneratedImageManagement from "./settings/images/GeneratedImageManagement.jsx";
import {DEFAULT_IMAGE_LEVEL} from "./settings/images/imageLevels.js";
import GoogleAuthCallback from "./settings/connections/GoogleAuthCallback.jsx";
import AtlassianAuthCallback from "./settings/connections/AtlassianAuthCallback.jsx";
import Header from "./common/Header.jsx";
import {SharedDataProvider} from "./context/SharedDataContext.jsx";
import AuthenticationWrapper from "./authorizer/AuthenticationWrapper.jsx";

const Layout = () => (
    <div>
        <Header/>
        <div className="app-layout-content">
            <Outlet/>
        </div>
    </div>
);

/*
 * Exported for the test that pins the one property this whole arrangement rests on: the index
 * route and `chat/:chatId` render the same element at the same depth, so React reconciles rather
 * than remounts when a new chat rewrites the url mid-stream. Wrapping either one on its own would
 * break that silently — the first answer of every new chat would die halfway through.
 */
export const routes = [
    {
        path: "/",
        element: <Layout/>,
        children: [
            {index: true, element: <ChatPage/>},
            {path: "chat/:chatId", element: <ChatPage/>},
            {
                path: "settings",
                element: <UserSettings/>,
                children: [
                    {index: true, element: <Navigate to="general" replace/>},
                    {path: "general", element: <GeneralUserSettings/>},
                    {path: "connections", element: <ConnectionsSettings/>},
                    {path: "rag", element: <Navigate to={DEFAULT_RAG_LEVEL} replace/>},
                    {path: "rag/:level", element: <RagManagement/>},
                    {path: "images", element: <Navigate to={DEFAULT_IMAGE_LEVEL} replace/>},
                    {path: "images/:level", element: <GeneratedImageManagement/>},
                ]
            },
            {path: "google/auth/callback", element: <GoogleAuthCallback/>},
            {path: "atlassian/auth/callback", element: <AtlassianAuthCallback/>},
        ]
    }
];

const router = createBrowserRouter(routes);

const App = () => {
    return (
        <AuthenticationWrapper>
            <SharedDataProvider>
                <RouterProvider router={router}/>
            </SharedDataProvider>
        </AuthenticationWrapper>
    );
};
export default App;
