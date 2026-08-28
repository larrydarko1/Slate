import { describe, it, expect, vi } from 'vitest';

const exposeInMainWorld = vi.fn();
const invoke = vi.fn().mockResolvedValue(undefined);
const send = vi.fn();
const on = vi.fn();
const removeListener = vi.fn();

vi.mock('electron', () => ({
    contextBridge: { exposeInMainWorld: (...a: unknown[]) => exposeInMainWorld(...a) },
    ipcRenderer: {
        invoke: (...a: unknown[]) => invoke(...a),
        send: (...a: unknown[]) => send(...a),
        on: (...a: unknown[]) => on(...a),
        removeListener: (...a: unknown[]) => removeListener(...a),
    },
}));

await import('@/preload/index');

type Api = {
    isElectron: () => boolean;
    log: Record<'error' | 'warn' | 'info' | 'debug', (message: string, details?: Record<string, unknown>) => void>;
    showSaveDialog: (p?: string) => unknown;
    showOpenDialog: () => unknown;
    writeFile: (p: string, c: string) => unknown;
    readFile: (p: string) => unknown;
    onOpenFile: (cb: (p: string) => void) => () => void;
    openExternal: (url: string) => unknown;
};

const [namespace, api] = exposeInMainWorld.mock.calls[0] as [string, Api];

describe('preload bridge', () => {
    it('exposes one namespace on the window', () => {
        expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
        expect(namespace).toBe('electronAPI');
    });

    it('tells the renderer it is running under Electron', () => {
        expect(api.isElectron()).toBe(true);
    });

    it('exposes exactly the documented surface — nothing more', () => {
        expect(Object.keys(api).sort()).toEqual(
            [
                'isElectron',
                'log',
                'onOpenFile',
                'openExternal',
                'readFile',
                'showOpenDialog',
                'showSaveDialog',
                'writeFile',
            ].sort(),
        );
    });

    describe('logging', () => {
        it.each(['error', 'warn', 'info', 'debug'] as const)('sends log:%s as an entry object', (level) => {
            send.mockClear();
            api.log[level]('hello', { code: 1 });
            expect(send).toHaveBeenCalledWith(`log:${level}`, { message: 'hello', details: { code: 1 } });
        });

        it('sends an entry with no details when none are given', () => {
            send.mockClear();
            api.log.info('plain');
            expect(send).toHaveBeenCalledWith('log:info', { message: 'plain', details: undefined });
        });
    });

    describe('file operations', () => {
        it.each([
            ['showSaveDialog', 'dialog:save', ['/tmp/a.slate']],
            ['showOpenDialog', 'dialog:open', []],
            ['writeFile', 'file:write', ['/tmp/a.slate', '{}']],
            ['readFile', 'file:read', ['/tmp/a.slate']],
            ['openExternal', 'shell:openExternal', ['https://example.com']],
        ])('%s invokes %s', (method, channel, args) => {
            invoke.mockClear();
            (api[method as keyof Api] as (...a: unknown[]) => unknown)(...(args as unknown[]));
            expect(invoke).toHaveBeenCalledWith(channel, ...(args as unknown[]));
        });
    });

    describe('onOpenFile', () => {
        it('subscribes to the file:opened event', () => {
            on.mockClear();
            api.onOpenFile(() => {});
            expect(on).toHaveBeenCalledWith('file:opened', expect.any(Function));
        });

        it('hands the path to the callback without the event object', () => {
            on.mockClear();
            const seen: string[] = [];
            api.onOpenFile((filePath) => seen.push(filePath));
            const handler = on.mock.calls.at(-1)?.[1] as (e: unknown, p: string) => void;
            handler({}, '/tmp/opened.slate');
            expect(seen).toEqual(['/tmp/opened.slate']);
        });

        it('returns an unsubscribe that removes the same listener', () => {
            on.mockClear();
            removeListener.mockClear();
            const off = api.onOpenFile(() => {});
            const registered = on.mock.calls.at(-1)?.[1];
            off();
            expect(removeListener).toHaveBeenCalledWith('file:opened', registered);
        });
    });
});
