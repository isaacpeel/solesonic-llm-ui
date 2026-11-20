import HyperDX from '@hyperdx/browser';

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The browser never holds the HyperDX ingestion key: the host nginx in front of the OTLP
// endpoint sets the authorization header itself. The SDK still refuses to start without a
// non-empty apiKey, so it gets this fixed, non-secret placeholder (nginx overwrites it).
export const PLACEHOLDER_API_KEY = 'nginx-injected';

const originOf = (url) => {
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
};

export function telemetryConfig(env) {
    const url = env.VITE_HYPERDX_URL;
    if (!url) {
        return null;
    }
    const apiOrigin = originOf(env.VITE_API_BASE_URI);
    return {
        url,
        apiKey: PLACEHOLDER_API_KEY,
        service: 'llm-ui',
        tracePropagationTargets: apiOrigin ? [new RegExp(`^${escapeRegExp(apiOrigin)}(?:[/?#]|$)`)] : [],
        consoleCapture: true,
        advancedNetworkCapture: false,
        maskAllInputs: true,
        maskAllText: true,
        disableIntercom: true,
        otelResourceAttributes: {'deployment.environment.name': env.MODE === 'production' ? 'prod' : env.MODE},
    };
}

export function initTelemetry(env = import.meta.env, client = HyperDX) {
    const config = telemetryConfig(env);
    if (!config) {
        return false;
    }
    try {
        client.init(config);
        return true;
    } catch {
        return false;
    }
}
