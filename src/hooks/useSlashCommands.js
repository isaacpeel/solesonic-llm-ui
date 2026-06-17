import {useEffect, useRef, useState} from 'react';
import slashCommandService from '../service/SlashCommandService.js';

function extractCommandToken(inputValue) {
    return inputValue.slice(1).split(/\s+/)[0] || '';
}

function isTypingSlashCommand(inputValue) {
    return /^\/\S*$/.test(inputValue);
}

function useSlashCommands({inputValue, setInputValue}) {
    const [commandCandidates, setCommandCandidates] = useState([]);
    const debounceTimerRef = useRef(null);

    useEffect(() => {

        if (!inputValue.startsWith('/')) {
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

    const suggestion = commandCandidates[0] ?? null;

    const partialToken = isTypingSlashCommand(inputValue) ? extractCommandToken(inputValue) : '';

    let ghostText = '';
    if (suggestion && partialToken && suggestion.name.startsWith(partialToken) && suggestion.name !== partialToken) {
        ghostText = suggestion.name.slice(partialToken.length);
    }

    function handleTabAccept() {
        if (suggestion) {
            setInputValue(`/${suggestion.name} `);
            setCommandCandidates([]);
        }
    }

    function getSelectedCommand() {
        if (!isTypingSlashCommand(inputValue)) {
            return null;
        }
        const token = extractCommandToken(inputValue);
        const exactMatch = commandCandidates.find(candidate => candidate.name === token);
        return exactMatch ? exactMatch.name : null;
    }

    return {commandCandidates, ghostText, suggestion, handleTabAccept, getSelectedCommand};
}

export default useSlashCommands;
