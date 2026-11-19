import {describe, expect, it, vi} from 'vitest';
import {initTelemetry, telemetryConfig} from '../src/telemetry.js';

const env = {
    VITE_HYPERDX_URL: 'https://izzy-bot.example/otlp',
    VITE_HYPERDX_API_KEY: 'browser-key',
    VITE_API_BASE_URI: 'https://api.izzy-bot.example/izzybot',
    MODE: 'production',
};

describe('telemetry', () => {
    it('does nothing unless the HyperDX URL and key are set', () => {
        const client = {init: vi.fn()};
        expect(initTelemetry({VITE_HYPERDX_URL: 'https://x'}, client)).toBe(false);
        expect(initTelemetry({}, client)).toBe(false);
        expect(client.init).not.toHaveBeenCalled();
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
