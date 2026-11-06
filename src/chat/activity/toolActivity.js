export const TOOL_ACTIVITY_EVENT = 'tool';

export const TOOL_RUNNING = 'running';
export const TOOL_OK = 'ok';
export const TOOL_ERROR = 'error';

const START = 'start';
const END = 'end';

function isToolActivity(value) {
    return !!value
        && typeof value === 'object'
        && typeof value.toolCallId === 'string'
        && value.toolCallId.length > 0
        && typeof value.name === 'string'
        && (value.phase === START || value.phase === END);
}

export function applyToolActivity(toolCalls, value, nowMilliseconds = Date.now()) {
    if (!isToolActivity(value)) {
        return toolCalls;
    }

    const known = Array.isArray(toolCalls) ? toolCalls : [];
    const index = known.findIndex((toolCall) => toolCall.toolCallId === value.toolCallId);
    const existing = index >= 0 ? known[index] : null;
    const argumentsText = typeof value.arguments === 'string' ? value.arguments : existing?.arguments ?? null;

    const next = value.phase === START
        ? {
            toolCallId: value.toolCallId,
            name: value.name,
            arguments: argumentsText,
            status: existing?.status && existing.status !== TOOL_RUNNING ? existing.status : TOOL_RUNNING,
            startedAt: existing?.startedAt ?? nowMilliseconds,
            durationMs: existing?.durationMs ?? null,
        }
        : {
            toolCallId: value.toolCallId,
            name: value.name,
            arguments: argumentsText,
            status: value.status === TOOL_ERROR ? TOOL_ERROR : TOOL_OK,
            startedAt: existing?.startedAt ?? nowMilliseconds,
            durationMs: Number.isFinite(value.durationMs) ? value.durationMs : existing?.durationMs ?? null,
        };

    if (index < 0) {
        return [...known, next];
    }

    const updated = [...known];
    updated[index] = next;
    return updated;
}

export function savedToolCalls(saved) {
    if (!Array.isArray(saved) || saved.length === 0) {
        return undefined;
    }

    const toolCalls = saved
        .filter((toolCall) => typeof toolCall?.toolCallId === 'string' && typeof toolCall?.name === 'string')
        .map((toolCall) => ({
            toolCallId: toolCall.toolCallId,
            name: toolCall.name,
            arguments: typeof toolCall.arguments === 'string' ? toolCall.arguments : null,
            status: toolCall.status === TOOL_ERROR ? TOOL_ERROR : TOOL_OK,
            startedAt: null,
            durationMs: Number.isFinite(toolCall.durationMs) ? toolCall.durationMs : null,
        }));

    return toolCalls.length > 0 ? toolCalls : undefined;
}

export function settledToolCalls(liveToolCalls, saved) {
    return Array.isArray(liveToolCalls) && liveToolCalls.length > 0 ? liveToolCalls : savedToolCalls(saved);
}

export function summarizeToolCalls(toolCalls) {
    const known = Array.isArray(toolCalls) ? toolCalls : [];

    return {
        total: known.length,
        running: known.filter((toolCall) => toolCall.status === TOOL_RUNNING).length,
        failed: known.filter((toolCall) => toolCall.status === TOOL_ERROR).length,
        totalMs: known.reduce((sum, toolCall) => sum + (Number.isFinite(toolCall.durationMs) ? toolCall.durationMs : 0), 0),
    };
}

export function formatDuration(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        return '';
    }

    if (milliseconds < 1000) {
        return `${Math.round(milliseconds)}ms`;
    }

    const seconds = milliseconds / 1000;

    if (seconds < 60) {
        return `${seconds.toFixed(1)}s`;
    }

    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${Math.round(seconds % 60)}s`;
}
