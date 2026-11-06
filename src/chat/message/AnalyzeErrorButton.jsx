import PropTypes from 'prop-types';
import {useState} from 'react';

function AnalyzeErrorButton({onAnalyze, busy}) {
    const [requested, setRequested] = useState(false);
    const [sawBusy, setSawBusy] = useState(false);

    if (requested && busy && !sawBusy) {
        setSawBusy(true);
    }

    if (requested && sawBusy && !busy) {
        return null;
    }

    const handleClick = async () => {
        setRequested(true);
        const sent = await onAnalyze();

        if (sent === false) {
            setRequested(false);
            setSawBusy(false);
        }
    };

    return (
        <div className="analyze-error">
            <button
                type="button"
                className="analyze-error-button"
                onClick={handleClick}
                disabled={busy || requested}
                aria-label="Analyze this error"
            >
                {requested ? 'Analyzing…' : 'Analyze'}
            </button>
        </div>
    );
}

AnalyzeErrorButton.propTypes = {
    onAnalyze: PropTypes.func.isRequired,
    busy: PropTypes.bool,
};

export default AnalyzeErrorButton;
