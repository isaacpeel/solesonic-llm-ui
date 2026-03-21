import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import slashCommandService from '../service/SlashCommandService.js';

function extractCommandToken(inputValue) {
    return inputValue.slice(1).split(/\s+/)[0] || '';
}

function isTypingSlashCommand(inputValue) {
    return /^\/\S*$/.test(inputValue);
}

function useSlashCommands({inputValue, setInputValue}) {
    const [suggestion, setSuggestion] = useState(null);
    const [commandCandidates, setCommandCandidates] = useState([]);
    const debounceTimerRef = useRef(null);

    useEffect(() => {

        if (!inputValue.startsWith('/')) {
            setSuggestion(null);
            setCommandCandidates([]);

            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }

            return;
        }

        if (!isTypingSlashCommand(inputValue)) {
            return;
        }

        const partialCommandText = extractCommandToken(inputValue);

        if (!partialCommandText) {
            setSuggestion(null);
            setCommandCandidates([]);
            return;
        }

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        let activeRequest = true;

        debounceTimerRef.current = setTimeout(async () => {
            const fetchedCommands = await slashCommandService.fetchCommands(partialCommandText);

            if (activeRequest) {
                setCommandCandidates(fetchedCommands);
            }
        }, 250);

        return () => {
            activeRequest = false;

            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
        };
    }, [inputValue]);

    useEffect(() => {

        if (!inputValue.startsWith('/')) {
            setSuggestion(null);
            return;
        }

        const partialCommandText = extractCommandToken(inputValue);

        if (!partialCommandText) {
            setSuggestion(null);
            return;
        }

        const nextSuggestion = commandCandidates.find(({command}) => command.startsWith(partialCommandText)) || null;
        setSuggestion(nextSuggestion);
    }, [commandCandidates, inputValue]);

    const ghostText = useMemo(() => {

        if (!suggestion) {
            return '';
        }

        const partialCommandText = extractCommandToken(inputValue);

        if (!suggestion.command.startsWith(partialCommandText)) {
            return '';
        }

        return suggestion.command.slice(partialCommandText.length);
    }, [inputValue, suggestion]);

    const handleTabAccept = useCallback(() => {

        if (!suggestion) {
            return;
        }

        setInputValue(`/${suggestion.command} `);
        setSuggestion(null);
    }, [setInputValue, suggestion]);

    const getSelectedCommand = useCallback(() => {

        if (!inputValue.startsWith('/')) {
            return null;
        }

        const commandToken = extractCommandToken(inputValue);

        if (!commandToken) {
            return null;
        }

        const matchingCandidate = commandCandidates.find(({command}) => command === commandToken);

        if (!matchingCandidate) {
            return null;
        }

        return matchingCandidate.command;
    }, [commandCandidates, inputValue]);

    const getMessageText = useCallback(() => {
        const selectedCommand = getSelectedCommand();

        if (!selectedCommand) {
            return inputValue.trim();
        }

        const commandPrefix = `/${selectedCommand}`;

        if (!inputValue.startsWith(commandPrefix)) {
            return inputValue.trim();
        }

        return inputValue.slice(commandPrefix.length).trim();
    }, [getSelectedCommand, inputValue]);

    return {
        suggestion,
        ghostText,
        commandCandidates,
        handleTabAccept,
        getSelectedCommand,
        getMessageText,
    };
}

export default useSlashCommands;
