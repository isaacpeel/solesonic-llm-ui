import PropTypes from 'prop-types';
import './UserMessageCommandBadge.css';

function UserMessageCommandBadge({command}) {
    return (
        <div className="user-message-command-badge">
            /{command}
        </div>
    );
}

UserMessageCommandBadge.propTypes = {
    command: PropTypes.string.isRequired,
};

export default UserMessageCommandBadge;
