import HyperDX from '@hyperdx/browser';

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const originOf = (url) => {
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
};

export function telemetryConfig(env) {
    const url = env.VITE_HYPERDX_URL;
    const apiKey = env.VITE_HYPERDX_API_KEY;
    if (!url || !apiKey) {
        return null;
    }
    const apiOrigin = originOf(env.VITE_API_BASE_URI);
    return {
        url,
        apiKey,
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
