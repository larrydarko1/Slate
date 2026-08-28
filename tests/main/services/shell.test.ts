import { describe, it, expect, beforeEach, vi } from 'vitest';

const openExternal = vi.fn();
vi.mock('electron', () => ({ shell: { openExternal: (url: string) => openExternal(url) } }));

const { register, openExternalIfSafe } = await import('@/main/services/shell');

type Handler = (event: unknown, ...args: unknown[]) => unknown;

/** A stand-in IpcMain that keeps the handlers so a test can invoke one. */
function fakeIpc(): { handlers: Map<string, Handler>; ipc: Parameters<typeof register>[0] } {
    const handlers = new Map<string, Handler>();
    const ipc = { handle: (channel: string, fn: Handler) => handlers.set(channel, fn) };
    return { handlers, ipc: ipc as unknown as Parameters<typeof register>[0] };
}

describe('shell service', () => {
    let call: (url: unknown) => Promise<{ success: boolean; error?: string }>;

    beforeEach(() => {
        openExternal.mockReset().mockResolvedValue(undefined);
        const { handlers, ipc } = fakeIpc();
        register(ipc);
        const handler = handlers.get('shell:openExternal');
        call = (url) => handler?.(null, url) as Promise<{ success: boolean; error?: string }>;
    });

    it('registers exactly one channel', () => {
        const { handlers, ipc } = fakeIpc();
        register(ipc);
        expect([...handlers.keys()]).toEqual(['shell:openExternal']);
    });

    it('opens an https url', async () => {
        await expect(call('https://example.com')).resolves.toEqual({ success: true });
        expect(openExternal).toHaveBeenCalledWith('https://example.com');
    });

    it('opens an http url', async () => {
        await expect(call('http://example.com')).resolves.toEqual({ success: true });
    });

    it.each(['file:///etc/passwd', 'smb://server/share', 'javascript:alert(1)'])('refuses %s', async (url) => {
        const result = await call(url);
        expect(result.success).toBe(false);
        expect(openExternal).not.toHaveBeenCalled();
    });

    it('rejects a non-string argument before the scheme check', async () => {
        const result = await call(42);
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(openExternal).not.toHaveBeenCalled();
    });

    it('reports a failure from the OS', async () => {
        openExternal.mockRejectedValue(new Error('no handler'));
        await expect(call('https://example.com')).resolves.toEqual({ success: false, error: 'no handler' });
    });

    it('survives a rejection that is not an Error', async () => {
        openExternal.mockRejectedValue('nope');
        const result = await call('https://example.com');
        expect(result).toEqual({ success: false, error: 'Could not open URL' });
    });

    describe('openExternalIfSafe', () => {
        it('opens a safe url without returning a result', () => {
            expect(openExternalIfSafe('https://example.com')).toBeUndefined();
            expect(openExternal).toHaveBeenCalledWith('https://example.com');
        });

        it('drops an unsafe url', () => {
            openExternalIfSafe('file:///etc/passwd');
            expect(openExternal).not.toHaveBeenCalled();
        });

        it('swallows a rejection rather than leaving it floating', async () => {
            openExternal.mockRejectedValue(new Error('boom'));
            expect(() => openExternalIfSafe('https://example.com')).not.toThrow();
            await Promise.resolve();
        });
    });
});
