import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * The module reads process.env once at import, so each case needs a fresh module
 * registry rather than a re-import of the cached one.
 */
async function loadConfig(env: Record<string, string | undefined>): Promise<{ rendererUrl: string }> {
    vi.resetModules();
    const original = { ...process.env };
    Object.assign(process.env, env);
    for (const [key, value] of Object.entries(env)) {
        if (value === undefined) delete process.env[key];
    }
    try {
        const { config } = await import('@/main/lib/config');
        return config;
    } finally {
        process.env = original;
    }
}

describe('config', () => {
    afterEach(() => {
        vi.resetModules();
    });

    it('reads the renderer url the dev server sets', async () => {
        const config = await loadConfig({ ELECTRON_RENDERER_URL: 'http://localhost:3000' });
        expect(config.rendererUrl).toBe('http://localhost:3000');
    });

    it('falls back to an empty string in a packaged build', async () => {
        const config = await loadConfig({ ELECTRON_RENDERER_URL: undefined });
        expect(config.rendererUrl).toBe('');
    });

    it('is what main/index.ts uses to tell dev from packaged', async () => {
        expect((await loadConfig({ ELECTRON_RENDERER_URL: undefined })).rendererUrl === '').toBe(true);
        expect((await loadConfig({ ELECTRON_RENDERER_URL: 'http://localhost:3000' })).rendererUrl === '').toBe(false);
    });
});
