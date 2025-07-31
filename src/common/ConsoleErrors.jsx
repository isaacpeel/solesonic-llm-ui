import './ConsoleErrors.css';
import PropTypes from 'prop-types';

const ConsoleErrors = ({ error }) => {
    if (!error) return null;

    return (
        <div className="error-display">
            <h3>Error Occurred</h3>
            <pre><strong>Message:</strong> {error.errorMessage || error.toString()}</pre>
            {error.name && <pre><strong>Name:</strong> {error.name}</pre>}
            {error.requestMethod && <pre><strong>Request Method:</strong> {error.requestMethod}</pre>}
            {error.requestUri && <pre><strong>Uri:</strong> {error.requestUri}</pre>}
            {error.stack && (
                <div>
                    <pre><strong>Stack Trace:</strong></pre>
                    <pre>{error.stack}</pre>
                </div>
            )}
        </div>
    );
};

ConsoleErrors.propTypes = {
    error: PropTypes.shape({
        errorMessage: PropTypes.string,
        requestMethod: PropTypes.string,
        requestUri: PropTypes.string,
        message: PropTypes.string,
        name: PropTypes.string,
        stack: PropTypes.string,
    }),
};


export default ConsoleErrors;
