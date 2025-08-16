import logo from "/solesonic-llm-ui-logo-dark.webp?url";
import './AuthComponents.css';

const components = {
    SignIn: {
        Header() {
            return (
                <header className="login-header">
                    <div className="login-header-content">
                        <img src={logo} alt="solesonic-llm logo" className="logo" />
                        <h1 className="welcome-text">Welcome to solesonic-llm</h1>
                    </div>
                </header>
            );
        },
        Footer() {
            const currentYear = new Date().getFullYear();
            return (
                <footer className="login-footer">
                    <p>&copy; {currentYear} solesonic-llm. All rights reserved.</p>
                </footer>
            );
        }
    },
    SignInForm() {
        return (
            <main className="login-main">
                <form className="login-form">
                    <input
                        type="text"
                        placeholder="Username"
                        className="login-input"
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        className="login-input"
                    />
                    <button type="submit" className="login-button">
                        Sign In
                    </button>
                </form>
            </main>
        );
    }
};

export default components;
