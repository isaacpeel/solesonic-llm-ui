import {useState, useCallback, useEffect} from 'react';

function useSlashCommandSelection({commandCandidates, setInputValue}) {
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [selectedCommand, setSelectedCommand] = useState(null);

    useEffect(() => {
        setSelectedIndex(-1);
    }, [commandCandidates]);

    const handleArrowDown = useCallback(() => {
        setSelectedIndex(previous => Math.min(previous + 1, commandCandidates.length - 1));
    }, [commandCandidates.length]);

    const handleArrowUp = useCallback(() => {
        setSelectedIndex(previous => Math.max(previous - 1, -1));
    }, []);

    const handleCommandSelect = useCallback((commandObject) => {
        if (!commandObject) return;
        setSelectedCommand(commandObject);
        setInputValue('');
        setSelectedIndex(-1);
    }, [setInputValue]);

    const handleDismiss = useCallback(() => {
        setSelectedCommand(null);
        setSelectedIndex(-1);
    }, []);

    const clearSelectedCommand = useCallback(() => {
        setSelectedCommand(null);
        setSelectedIndex(-1);
    }, []);

    return {selectedIndex, selectedCommand, handleArrowDown, handleArrowUp, handleCommandSelect, handleDismiss, clearSelectedCommand};
}

export default useSlashCommandSelection;
