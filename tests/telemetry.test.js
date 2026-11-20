import {describe, expect, it, vi} from 'vitest';
import {initTelemetry, PLACEHOLDER_API_KEY, telemetryConfig} from '../src/telemetry.js';

const env = {
    VITE_HYPERDX_URL: 'https://izzy-bot.example/otlp',
    VITE_API_BASE_URI: 'https://api.izzy-bot.example/izzybot',
    MODE: 'production',
};

describe('telemetry', () => {
    it('does nothing unless the HyperDX URL is set', () => {
        const client = {init: vi.fn()};
        expect(initTelemetry({}, client)).toBe(false);
        expect(initTelemetry({VITE_HYPERDX_URL: ''}, client)).toBe(false);
        expect(client.init).not.toHaveBeenCalled();
    });

    it('never sends a real ingestion key, even when one is in the env', () => {
        const config = telemetryConfig({...env, VITE_HYPERDX_API_KEY: 'leaked-key'});
        expect(config.apiKey).toBe(PLACEHOLDER_API_KEY);
        expect(JSON.stringify(config)).not.toContain('leaked-key');
    });

    it('masks every text and input and captures no network bodies', () => {
        const config = telemetryConfig(env);
        expect(config.maskAllText).toBe(true);
        expect(config.maskAllInputs).toBe(true);
        expect(config.advancedNetworkCapture).toBe(false);
        expect(config.service).toBe('llm-ui');
        expect(config.otelResourceAttributes['deployment.environment.name']).toBe('prod');
    });

    it('propagates the trace only to the API origin', () => {
        const [target] = telemetryConfig(env).tracePropagationTargets;
        expect(target.test('https://api.izzy-bot.example/izzybot/chats')).toBe(true);
        expect(target.test('https://auth.izzy-bot.example/realms/x')).toBe(false);
        expect(target.test('https://api.izzy-bot.example.attacker.test/')).toBe(false);
    });

    it('initialises the client once configured and survives a failing client', () => {
        const client = {init: vi.fn()};
        expect(initTelemetry(env, client)).toBe(true);
        expect(client.init).toHaveBeenCalledOnce();
        expect(initTelemetry(env, {init: () => { throw new Error('blocked'); }})).toBe(false);
    });
});
