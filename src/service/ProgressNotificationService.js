// Expected payload shape:
//   { "progressToken": "<any>", "message": "Step label", "progress": 16.0, "total": 100.0 }
//   progressToken is required; at least one of message, progress, or total must be present.
//   The step label and a percentage derived from progress/total are surfaced to the UI.

/*
 * Matches the ` 16%` a formatted step carries. Used to recognise two frames as the same step
 * advancing rather than two distinct steps, so a run from 1% to 100% collapses to one row.
 */
const PROGRESS_PERCENTAGE_SUFFIX_PATTERN = /\s\d{1,3}%$/;

export function getProgressNotificationTextFromRawData(rawData) {
    if (typeof rawData !== 'string' || rawData.length === 0) {
        return null;
    }

    try {
        const parsedPayload = JSON.parse(rawData);
        const progressParams = extractProgressParams(parsedPayload);

        return formatProgressNotificationText(progressParams);
    } catch {
        return null;
    }
}

/*
 * Renders one progress frame as the line the user reads. A percentage is only appended when the
 * frame carries both a usable progress and a positive total — without a total the raw progress
 * is a count of unknown scale, and printing it as a percentage would be a guess.
 */
export function formatProgressNotificationText(progressParams) {
    if (!progressParams || typeof progressParams !== 'object') {
        return null;
    }

    const progressMessage = typeof progressParams.message === 'string' ? progressParams.message.trim() : '';
    const progressPercentage = toProgressPercentage(progressParams.progress, progressParams.total);

    if (progressMessage && progressPercentage !== null) {
        return `${progressMessage} ${progressPercentage}%`;
    }

    if (progressMessage) {
        return progressMessage;
    }

    if (progressPercentage !== null) {
        return `${progressPercentage}%`;
    }

    return null;
}

/*
 * Successive frames for the same step differ only in their percentage, so the newest one
 * replaces the previous rather than stacking — a hundred-frame generation stays a single
 * "Generating… 87%" row that counts up.
 */
export function appendProgressNotificationText(existingNotifications, notificationText) {
    const notifications = Array.isArray(existingNotifications) ? existingNotifications : [];

    if (!notificationText) {
        return notifications;
    }

    const previousNotificationText = notifications[notifications.length - 1];

    if (isSameProgressStep(previousNotificationText, notificationText)) {
        const collapsedNotifications = [...notifications];
        collapsedNotifications[collapsedNotifications.length - 1] = notificationText;

        return collapsedNotifications;
    }

    return [...notifications, notificationText];
}

function isSameProgressStep(previousNotificationText, notificationText) {
    if (typeof previousNotificationText !== 'string') {
        return false;
    }

    const carriesPercentage = PROGRESS_PERCENTAGE_SUFFIX_PATTERN.test(previousNotificationText)
        || PROGRESS_PERCENTAGE_SUFFIX_PATTERN.test(notificationText);

    if (!carriesPercentage) {
        return false;
    }

    return stripProgressPercentage(previousNotificationText) === stripProgressPercentage(notificationText);
}

function stripProgressPercentage(notificationText) {
    return notificationText.replace(PROGRESS_PERCENTAGE_SUFFIX_PATTERN, '');
}

/*
 * The backend sends these as strings ("16.0"/"100.0"), and vision frames send them as null,
 * so every value goes through an explicit finite check before the division.
 */
function toProgressPercentage(progress, total) {
    if (progress === null || progress === undefined || progress === '') {
        return null;
    }

    if (total === null || total === undefined || total === '') {
        return null;
    }

    const progressValue = Number(progress);
    const totalValue = Number(total);

    if (!Number.isFinite(progressValue) || !Number.isFinite(totalValue) || totalValue <= 0) {
        return null;
    }

    const percentage = Math.round((progressValue / totalValue) * 100);

    return Math.min(100, Math.max(0, percentage));
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
