import {useEffect, useId, useState} from 'react';
import {CheckIcon, ChevronDownIcon, ExclamationTriangleIcon, StopCircleIcon} from '@heroicons/react/20/solid';
import {TOOL_ERROR, TOOL_RUNNING, formatDuration, summarizeToolCalls} from './toolActivity.js';
import './ToolActivity.css';

function useNow(active) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!active) {
            return undefined;
        }

        const intervalId = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(intervalId);
    }, [active]);

    return now;
}

function headerLabel(summary, runningName, streaming) {
    const calls = `${summary.total} tool ${summary.total === 1 ? 'call' : 'calls'}`;

    if (streaming && summary.running > 0) {
        return summary.total > 1 ? `Running ${runningName} · ${calls}` : `Running ${runningName}`;
    }

    const parts = [calls];

    if (summary.totalMs > 0) {
        parts.push(formatDuration(summary.totalMs));
    }

    if (summary.failed > 0) {
        parts.push(`${summary.failed} failed`);
    }

    return parts.join(' · ');
}

function StatusIcon({status, streaming}) {
    if (status === TOOL_RUNNING) {
        return streaming
            ? <span className="tool-activity-spinner" aria-hidden="true"/>
            : <StopCircleIcon className="tool-activity-icon tool-activity-icon--stopped" aria-hidden="true"/>;
    }

    if (status === TOOL_ERROR) {
        return <ExclamationTriangleIcon className="tool-activity-icon tool-activity-icon--error" aria-hidden="true"/>;
    }

    return <CheckIcon className="tool-activity-icon tool-activity-icon--ok" aria-hidden="true"/>;
}

function rowResult(toolCall, streaming, now) {
    if (toolCall.status === TOOL_RUNNING) {
        return streaming ? formatDuration(now - toolCall.startedAt) : 'stopped';
    }

    const duration = formatDuration(toolCall.durationMs);
    return toolCall.status === TOOL_ERROR ? `failed${duration ? ` · ${duration}` : ''}` : duration;
}

function ToolActivity({toolCalls, streaming = false}) {
    const [expandedChoice, setExpandedChoice] = useState(null);
    const listId = useId();
    const calls = Array.isArray(toolCalls) ? toolCalls : [];
    const summary = summarizeToolCalls(calls);
    const now = useNow(streaming && summary.running > 0);

    if (calls.length === 0) {
        return null;
    }

    const expanded = expandedChoice ?? streaming;
    const runningCall = calls.findLast((toolCall) => toolCall.status === TOOL_RUNNING);
    const headerStatus = streaming && summary.running > 0
        ? TOOL_RUNNING
        : summary.failed > 0 ? TOOL_ERROR : 'ok';

    return (
        <div className="tool-activity">
            <button
                type="button"
                className="tool-activity-header"
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={() => setExpandedChoice(!expanded)}
            >
                <StatusIcon status={headerStatus} streaming={streaming}/>
                <span className="tool-activity-label">{headerLabel(summary, runningCall?.name, streaming)}</span>
                <ChevronDownIcon className={`tool-activity-chevron${expanded ? ' tool-activity-chevron--open' : ''}`} aria-hidden="true"/>
            </button>
            {expanded && (
                <ul id={listId} className="tool-activity-list">
                    {calls.map((toolCall) => (
                        <li key={toolCall.toolCallId} className={`tool-activity-row tool-activity-row--${toolCall.status}`}>
                            <StatusIcon status={toolCall.status} streaming={streaming}/>
                            <span className="tool-activity-name">{toolCall.name}</span>
                            {toolCall.arguments && (
                                <span className="tool-activity-arguments" title={toolCall.arguments}>{toolCall.arguments}</span>
                            )}
                            <span className="tool-activity-result">{rowResult(toolCall, streaming, now)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default ToolActivity;
