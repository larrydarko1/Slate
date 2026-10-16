import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { IpcMain } from '@/main/lib/ipc';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

vi.mock('@/main/lib/logger', () => ({ log: { warn: vi.fn() } }));

const openExternal = vi.fn();

vi.mock('electron', () => ({ shell: { openExternal: (url: string): unknown => openExternal(url) } }));

const { register, openExternalIfSafe } = await import('@/main/services/shell');

/** A stand-in IpcMain that keeps the handlers so a test can invoke one. */
function fakeIpc(): { handlers: Map<string, Handler>; ipc: IpcMain } {
    const handlers = new Map<string, Handler>();
    const ipc: IpcMain = {
        handle(channel, fn) {
            handlers.set(channel, fn);
        },
        on: vi.fn(),
    };
    return { handlers, ipc };
}

describe('shell service', () => {
    let call: (url: unknown) => Promise<unknown>;

    beforeEach(() => {
        openExternal.mockReset().mockResolvedValue(undefined);
        const { handlers, ipc } = fakeIpc();
        register(ipc);
        const handler = handlers.get('shell:openExternal');
        call = (url) => Promise.resolve(handler?.(null, url));
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
        await expect(call(url)).resolves.toEqual({ success: false, error: 'INVALID_ARGUMENTS' });
        expect(openExternal).not.toHaveBeenCalled();
    });

    it('rejects a non-string argument before the scheme check', async () => {
        await expect(call(42)).resolves.toEqual({ success: false, error: 'INVALID_ARGUMENTS' });
        expect(openExternal).not.toHaveBeenCalled();
    });

    it('reports a failure from the OS as a code', async () => {
        openExternal.mockRejectedValue(new Error('no handler'));
        await expect(call('https://example.com')).resolves.toEqual({ success: false, error: 'UNKNOWN' });
    });

    it('survives a rejection that is not an Error', async () => {
        openExternal.mockRejectedValue('nope');
        await expect(call('https://example.com')).resolves.toEqual({ success: false, error: 'UNKNOWN' });
    });

    describe('openExternalIfSafe', () => {
        it('opens a safe url', () => {
            openExternalIfSafe('https://example.com');
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
