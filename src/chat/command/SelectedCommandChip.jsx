import PropTypes from 'prop-types';
import {LockClosedIcon, LockOpenIcon} from '@heroicons/react/20/solid';
import './SelectedCommandChip.css';

function SelectedCommandChip({selectedCommand, isPinned, onTogglePin, onDeselect}) {
    return (
        <div className={`selected-command-chip${isPinned ? ' selected-command-chip--pinned' : ''}`}>
            <span className="selected-command-chip-name">/{selectedCommand.command}</span>
            {selectedCommand.description && (
                <span className="selected-command-chip-description">{selectedCommand.description}</span>
            )}
            <button
                className="selected-command-chip-pin"
                onMouseDown={(event) => {
                    event.preventDefault();
                    onTogglePin();
                }}
                aria-label={isPinned ? 'Unpin command' : 'Pin command to conversation'}
                title={isPinned ? 'Unpin command' : 'Pin command to conversation'}
            >
                {isPinned ? <LockClosedIcon/> : <LockOpenIcon/>}
            </button>
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
    isPinned: PropTypes.bool,
    onTogglePin: PropTypes.func.isRequired,
    onDeselect: PropTypes.func.isRequired,
};

export default SelectedCommandChip;
