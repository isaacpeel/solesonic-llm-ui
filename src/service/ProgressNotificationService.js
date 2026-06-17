// Expected payload shape:
//   { "progressToken": "<any>", "message": "Step label", "progress": 1, "total": 5 }
//   progressToken is required; at least one of message, progress, or total must be present.
//   Only `message` is surfaced to the UI; progress/total are used only for detection.

export function getProgressNotificationTextFromRawData(rawData) {
    if (typeof rawData !== 'string' || rawData.length === 0) {
        return null;
    }

    try {
        const parsedPayload = JSON.parse(rawData);
        return getProgressNotificationText(parsedPayload);
    } catch {
        return null;
    }
}

function getProgressNotificationText(parsedPayload) {
    const progressParams = extractProgressParams(parsedPayload);

    if (!progressParams) {
        return null;
    }

    const progressMessage = typeof progressParams.message === 'string' ? progressParams.message.trim() : '';

    if (progressMessage) {
        return progressMessage;
    }
}

function extractProgressParams(parsedPayload) {
    if (!parsedPayload || typeof parsedPayload !== 'object') {
        return null;
    }

    if (parsedPayload.method === 'notifications/progress' && parsedPayload.params) {
        return parsedPayload.params;
    }

    if (parsedPayload.progressToken && (
        typeof parsedPayload.message === 'string'
        || Number.isFinite(Number(parsedPayload.progress))
        || Number.isFinite(Number(parsedPayload.total))
    )) {
        return parsedPayload;
    }

    return null;
}
