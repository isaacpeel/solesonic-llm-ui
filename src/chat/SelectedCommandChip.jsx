import PropTypes from 'prop-types';
import './SelectedCommandChip.css';

function SelectedCommandChip({selectedCommand, onDeselect}) {
    return (
        <div className="selected-command-chip">
            <span className="selected-command-chip-name">/{selectedCommand.command}</span>
            {selectedCommand.description && (
                <span className="selected-command-chip-description">{selectedCommand.description}</span>
            )}
            <button
                className="selected-command-chip-dismiss"
                onMouseDown={(event) => {
                    event.preventDefault();
                    onDeselect();
                }}
                aria-label="Remove command"
            >
                ×
            </button>
        </div>
    );
}

SelectedCommandChip.propTypes = {
    selectedCommand: PropTypes.shape({
        command: PropTypes.string.isRequired,
        description: PropTypes.string,
    }).isRequired,
    onDeselect: PropTypes.func.isRequired,
};

export default SelectedCommandChip;
