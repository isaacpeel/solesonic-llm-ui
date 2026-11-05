export const LOGS_COMMAND = 'logs';

const QUOTED_ERROR_CHARACTERS = 300;

const ANALYZABLE_CODES = new Set([
    'internal',
    'timeout',
    'UPSTREAM_UNAVAILABLE',
    'RATE_LIMITED',
    'TOOL_FAILURE',
    'STREAM_UNAVAILABLE',
    'CONTEXT_LENGTH_EXCEEDED',
]);

export function isAnalyzableCode(code) {
    return typeof code === 'string' && ANALYZABLE_CODES.has(code);
}

export function commandsOfLastUserMessage(history, userType) {
    for (let index = history.length - 1; index >= 0; index -= 1) {
        if (history[index]?.type === userType) {
            return Array.isArray(history[index].commands) ? history[index].commands : [];
        }
    }

    return [];
}

export function canAnalyze(errorMessage) {
    if (!errorMessage?.analyzable) {
        return false;
    }

    const failedCommands = Array.isArray(errorMessage.failedCommands) ? errorMessage.failedCommands : [];

    return !failedCommands.includes(LOGS_COMMAND);
}

function isoTime(value) {
    const parsed = value ? new Date(value) : null;

    return parsed && !Number.isNaN(parsed.getTime())
        ? parsed.toISOString().replace(/\.\d{3}Z$/, 'Z')
        : new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function buildAnalyzeRequest(errorMessage) {
    const text = String(errorMessage?.text ?? '').replace(/\s+/g, ' ').trim();
    const quoted = text.length > QUOTED_ERROR_CHARACTERS ? `${text.slice(0, QUOTED_ERROR_CHARACTERS)}…` : text;
    const code = errorMessage?.code ? ` (code ${errorMessage.code})` : '';

    return `Analyze the error shown in this chat at ${isoTime(errorMessage?.occurredAt ?? errorMessage?.timestamp)}: `
        + `"${quoted}"${code}. Explain what happened and whether I should try again.`;
}
