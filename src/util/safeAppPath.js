const APP_PATH_PATTERN = /^\/(?:chat\/[A-Za-z0-9_-]+|interests\/offers\/[A-Za-z0-9_-]+(?:\?intent=accept)?|shared-sessions(?:\/invites)?\/[A-Za-z0-9_-]+|shared-sessions|settings(?:\/[A-Za-z0-9_-]+)*)?$/;

export function isSafeAppPath(url, origin) {
    if (typeof url !== 'string' || !APP_PATH_PATTERN.test(url)) {
        return false;
    }

    try {
        return new URL(url, origin).origin === origin;
    } catch {
        return false;
    }
}
