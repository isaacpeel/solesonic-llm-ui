import {createBrowserRouter, Outlet, RouterProvider} from "react-router-dom";
import './App.css';
import ChatPage from "./chat/ChatScreen.jsx";
import UserSettings from "./user/UserSettings.jsx";
import Header from "./common/Header.jsx";
import {SharedDataProvider} from "./context/SharedDataContext.jsx";
import AuthenticationWrapper from "./authorizer/AuthenticationWrapper.jsx";

const Layout = () => (
    <div>
        <Header />
        <div style={{marginTop: "60px", flex: 1, padding: "20px"}}>
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
            ]
        }

    ],
    {
        future: {
            v7_fetcherPersist: true
        },
    });

const App = () => {
    return (
        <AuthenticationWrapper>
            <SharedDataProvider>
                <RouterProvider
                    router={router}
                    future={{
                        v7_startTransition: true,
                        v7_relativeSplatPath: true,
                    }}/>
            </SharedDataProvider>
        </AuthenticationWrapper>
    );
};
export default App;
