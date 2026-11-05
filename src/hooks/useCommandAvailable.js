import {useEffect, useState} from 'react';

function useCommandAvailable(fetchCommands, command) {
    const [answer, setAnswer] = useState({fetchCommands: null, command: null, available: false});

    useEffect(() => {
        if (!fetchCommands || !command) {
            return undefined;
        }

        let cancelled = false;
        const settle = (available) => {
            if (!cancelled) {
                setAnswer({fetchCommands, command, available});
            }
        };

        Promise.resolve()
            .then(() => fetchCommands(command))
            .then((commands) => settle(Array.isArray(commands) && commands.some((candidate) => candidate?.command === command)))
            .catch(() => settle(false));

        return () => {
            cancelled = true;
        };
    }, [fetchCommands, command]);

    return !!fetchCommands && !!command && answer.fetchCommands === fetchCommands && answer.command === command
        && answer.available;
}

export default useCommandAvailable;
