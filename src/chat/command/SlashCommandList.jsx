import PropTypes from 'prop-types';
import './SlashCommandList.css';

function SlashCommandList({commandCandidates, selectedIndex, onCommandSelect}) {
    if (!commandCandidates.length) {
        return null;
    }

    return (
        <ul className="slash-command-list" role="listbox">
            {commandCandidates.map((candidate, index) => (
                <li
                    key={candidate.command}
                    role="option"
                    aria-selected={index === selectedIndex}
                    className={`slash-command-list-item${index === selectedIndex ? ' slash-command-list-item--active' : ''}`}
                    onMouseDown={(event) => {
                        event.preventDefault();
                        onCommandSelect(candidate);
                    }}
                >
                    <span className="slash-command-list-item-name">/{candidate.command}</span>
                    {candidate.description && (
                        <span className="slash-command-list-item-description">{candidate.description}</span>
                    )}
                </li>
            ))}
        </ul>
    );
}

SlashCommandList.propTypes = {
    commandCandidates: PropTypes.arrayOf(PropTypes.shape({
        command: PropTypes.string.isRequired,
        description: PropTypes.string,
    })).isRequired,
    selectedIndex: PropTypes.number.isRequired,
    onCommandSelect: PropTypes.func.isRequired,
};

export default SlashCommandList;
